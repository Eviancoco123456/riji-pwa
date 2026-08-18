// 作业识别与建模

// 千问识别提示词：严格按原图提取，不猜测、不编造；并尽量判定每题对错
const PARSE_PROMPT =
  '你是一个严谨的家校作业识别与批改助手。图片可能是：①老师发布的每日作业清单（微信群/QQ群截图或拍屏），' +
  '或 ②学生已完成并写下答案的作业。请逐行、完整、按原文提取每一项，不要遗漏、不要合并、不要编造。\n' +
  '对每一项输出一个 JSON 对象，包含字段：\n' +
  'subject：从「语文、数学、英语、社会、科学」中选最贴切的一项；社会包含道法/历史/地理，科学包含物理/化学/生物。\n' +
  'type：从「默写、背诵、抄写、试卷、作业」中选；明显是测验/考试写试卷，需背的写背诵，需抄/摘抄的写抄写，其余写作业。\n' +
  'content：作业内容，尽量保留原文关键信息（如书名篇名、页码 Pxx、题号、范围）。\n' +
  'requirement：达标要求，按类型推断默认值——默写/背诵默认「错/漏 ≤2 处」，抄写默认「错/漏 ≤3 处」，试卷/练习/作业本默认「正确率 ≥80%」，纯阅读或整理类默认「完成即达标」；若原文有明确标准则直接使用原文。\n' +
  'studentAnswer：若图中能看到学生作答/填空，原样提取；若仅为作业布置（无学生作答）则填空字符串 ""。\n' +
  'judge：根据图中信息与你的学科知识判断该作答是否正确——"correct"（作答正确）、"wrong"（作答错误）、"unknown"（图中无作答或无法判定）。若仅为作业布置清单，填 "unknown"。\n' +
  'reference：若你能给出该题正确答案或简要解析则填写，否则填空字符串 ""。\n' +
  '只输出 JSON 数组本身，不要任何额外文字、不要 markdown 代码块。';

// 从模型回复中稳健提取 JSON 数组（兼容 ```json 包裹或前后多余文字）
function extractHomeworkJSON(text) {
  if (!text) return [];
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try { return JSON.parse(s); } catch (e) { return []; }
}

// 从模型回复中稳健提取单个 JSON 对象（单条批改结果）
function extractOneJSON(text) {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try { return JSON.parse(s); } catch (e) { return null; }
}

const Homework = {
  subjects: ['语文', '数学', '英语', '社会', '科学'],
  types: ['默写', '背诵', '抄写', '试卷', '作业'],

  getTodayDate() {
    return new Date().toISOString().slice(0, 10);
  },

  // 压缩图片为 dataURL（JPEG），控制体积后传给识别服务
  fileToDataURL(file, max = 1280, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > max) { height = Math.round(height * max / width); width = max; }
          else if (height > max) { width = Math.round(width * max / height); height = max; }
          const c = document.createElement('canvas');
          c.width = width; c.height = height;
          c.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  // 直连千问 dashscope 视觉识别（中国大陆可访问 + 浏览器跨域允许），绕过海外 Supabase
  async parseImage(file) {
    const dataUrl = await this.fileToDataURL(file, 1280, 0.8);
    const res = await fetch(VISION_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + VISION_API_KEY },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: PARSE_PROMPT },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: '请按上面的规则，把这张作业图里的每一项作业提取为 JSON 数组。' }
          ] }
        ],
        temperature: 0.2
      })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('千问返回 ' + res.status + ' ' + t.slice(0, 200));
    }
    const data = await res.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const items = extractHomeworkJSON(content);
    if (!items.length) throw new Error('未能从图片中识别到作业项，请换清晰图或手动添加');
    return this.normalize(items);
  },

  // 单条作业批改：把某一条已识别作业 + 它的完成图发给千问，判对错并给参考答案
  async gradeItemImage(file, item) {
    const dataUrl = await this.fileToDataURL(file, 1280, 0.8);
    const prompt =
      '你是一个批改助手。下面是一名学生某科作业的照片。\n' +
      '已知题目信息：科目「' + (item.subject || '') + '」，类型「' + (item.type || '') + '」，内容：「' + (item.content || '') + '」。\n' +
      '请识别图中的学生作答，并判断其是否正确。\n' +
      '只输出一个 JSON 对象，字段：\n' +
      'studentAnswer：图中学生作答原文（若图中无作答则填空字符串 ""）。\n' +
      'judge："correct"（作答正确）/ "wrong"（作答错误）/ "unknown"（无法判定）。\n' +
      'answer：该题正确答案。\n' +
      'reference：正确答案或简要解析（无则填空字符串 ""）。\n' +
      '不要任何额外文字、不要 markdown 代码块。';
    const res = await fetch(VISION_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + VISION_API_KEY },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: [{ type: 'image_url', image_url: { url: dataUrl } }] }
        ],
        temperature: 0.2
      })
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('千问返回 ' + res.status + ' ' + t.slice(0, 200));
    }
    const data = await res.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const obj = extractOneJSON(content);
    if (!obj) throw new Error('未能从图片解析出批改结果');
    return obj;
  },

  normalize(items) {
    return items
      .map((it) => ({
        id: 'item_' + Math.random().toString(36).slice(2, 9),
        subject: it.subject || '其他',
        subSubject: it.subSubject || null,
        type: it.type || '作业',
        content: (it.content || '').toString().trim(),
        requirement: it.requirement || this.thresholdText(it.type || '作业'),
        status: 'pending',
        passStatus: 'pending',
        // 千问上传即批改：AI 读出的作答/判定/参考答案（手动批改时作为预填）
        aiStudentAnswer: (it.studentAnswer || '').toString().trim(),
        aiJudge: it.judge || 'unknown',
        aiReference: (it.reference || '').toString().trim(),
        notes: ''
      }))
      .filter((it) => it.content);
  },

  thresholdText(type) {
    if (type === '默写' || type === '背诵') return '错/漏 ≤2';
    return '正确率 ≥80%';
  },

  async createFromItems(items, date) {
    date = date || this.getTodayDate();
    const hw = { id: 'hw_' + date, date, items };
    await Store.saveHomework(hw);
    return hw;
  }
};
