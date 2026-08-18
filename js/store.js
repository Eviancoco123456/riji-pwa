// 数据层：纯本地版（已移除云端同步）。
// 所有读写都在本机浏览器 localStorage，不跨设备、不上云。
// 仅「当前设备 + 当前浏览器」可见；换浏览器/清缓存数据不互通（这是单机版的预期行为）。
const Store = {
  _p: 'riji_',

  async init() {
    // 本地版无需初始化账号/同步码；预留钩子以便将来扩展。
    return;
  },

  _lsGet(k) {
    try { return JSON.parse(localStorage.getItem(this._p + k) || 'null'); } catch { return null; }
  },
  _lsSet(k, v) {
    try { localStorage.setItem(this._p + k, JSON.stringify(v)); }
    catch (e) { console.warn('[日迹] 本地存储写入失败（可能空间已满）：', e); alert('本地存储空间不足，部分数据可能未能保存。可减少上传的作业图片数量。'); }
  },

  // ---------- 作业 ----------
  async loadHomework() {
    return this._lsGet('homework') || [];
  },
  async saveHomework(hw) {
    const all = this._lsGet('homework') || [];
    const idx = all.findIndex((h) => h.id === hw.id);
    if (idx >= 0) all[idx] = hw; else all.push(hw);
    this._lsSet('homework', all);
    return hw;
  },
  async getHomeworkByDate(date) {
    const all = this._lsGet('homework') || [];
    return all.find((h) => h.date === date) || null;
  },

  // ---------- 错题 ----------
  async loadWrong() {
    return this._lsGet('wrong') || [];
  },
  async addWrong(q) {
    const list = this._lsGet('wrong') || [];
    // 同一作业条目（itemId）只保留一条：重批只更新，不重复堆砌
    if (q.itemId) {
      const ex = list.find((w) => w.itemId === q.itemId);
      if (ex) {
        // 再次判错/空白：累计错误次数与日期，并重置"连续作对"计数
        ex.errorCount = (ex.errorCount || 1) + 1;
        ex.errorDates = Array.from(new Set([...(ex.errorDates || []), q.date]));
        ex.correctCount = 0;
        ex.reason = q.reason;
        ex.answer = q.answer;
        ex.studentAnswer = q.studentAnswer;
        ex.masteryStatus = '薄弱';
        this._lsSet('wrong', list);
        return list;
      }
    }
    const id = 'wq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    // errorCount 错误累计次数；errorDates 每次出错日期；correctCount 连续作对次数（满 3 才移出）
    list.push(Object.assign({ id, errorCount: 1, errorDates: [q.date], correctCount: 0 }, q));
    this._lsSet('wrong', list);
    return list;
  },
  async removeWrong(id) {
    let list = this._lsGet('wrong') || [];
    list = list.filter((w) => w.id !== id);
    this._lsSet('wrong', list);
    return list;
  },
  // 批改"作对"：累加作对次数；满 3 次才移出错题库（不满则保留并更新进度）
  async recordCorrect(itemId, date) {
    const list = this._lsGet('wrong') || [];
    const ex = list.find((w) => w.itemId === itemId);
    if (!ex) return { removed: false, correctCount: 0 };
    ex.correctCount = (ex.correctCount || 0) + 1;
    ex.correctDates = Array.from(new Set([...(ex.correctDates || []), date]));
    let removed = false;
    if (ex.correctCount >= 3) {
      const idx = list.indexOf(ex);
      if (idx >= 0) list.splice(idx, 1);
      removed = true;
    }
    this._lsSet('wrong', list);
    return { removed, correctCount: ex.correctCount };
  },

  // ---------- 薄弱点（按知识点聚合） ----------
  async loadWeak() {
    return this._lsGet('weak') || [];
  },
  async upsertWeak(wp) {
    const list = this._lsGet('weak') || [];
    const existing = list.find((w) => w.knowledgePoint === wp.knowledgePoint);
    if (existing) {
      // 已有同知识点：频次+1，更新最近日期与日期集合
      existing.frequency = (existing.frequency || 0) + 1;
      existing.lastDate = wp.lastDate;
      existing.firstDate = existing.firstDate || wp.firstDate;
      existing.dates = Array.from(new Set([...(existing.dates || []), wp.lastDate]));
      if (wp.status) existing.status = wp.status;
      if (wp.subject) existing.subject = wp.subject;
      if (wp.subSubject) existing.subSubject = wp.subSubject;
    } else {
      list.push(Object.assign(
        { id: 'wp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), frequency: 1, dates: [wp.firstDate] },
        wp
      ));
    }
    this._lsSet('weak', list);
    return list;
  },

  // ---------- 图片（本地版：压缩后存为 dataURL，不再上传云存储） ----------
  async uploadImage(file) {
    // 复用 homework.js 的压缩能力，压到 1280px/JPEG 控制体积，返回 dataURL 直接当 src 用
    if (typeof Homework !== 'undefined' && Homework.fileToDataURL) {
      return await Homework.fileToDataURL(file, 1280, 0.8);
    }
    // 兜底：直接读原图
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  },

  // ---------- 备份：导出 / 导入 / 清空 ----------
  // 把全部题库（作业、错题、薄弱点）打包成一个对象，便于下载或迁移
  async exportAll() {
    return {
      app: 'riji',
      version: 1,
      exportedAt: new Date().toISOString(),
      homework: this._lsGet('homework') || [],
      wrong: this._lsGet('wrong') || [],
      weak: this._lsGet('weak') || []
    };
  },
  // 用备份文件覆盖回写本地。先做字段校验，避免坏文件清空数据。
  async importAll(data) {
    if (!data || typeof data !== 'object') throw new Error('文件格式不正确');
    const hw = Array.isArray(data.homework) ? data.homework : [];
    const wrong = Array.isArray(data.wrong) ? data.wrong : [];
    const weak = Array.isArray(data.weak) ? data.weak : [];
    if (!hw.length && !wrong.length && !weak.length)
      throw new Error('备份文件里没有任何题库数据');
    this._lsSet('homework', hw);
    this._lsSet('wrong', wrong);
    this._lsSet('weak', weak);
    return { homework: hw.length, wrong: wrong.length, weak: weak.length };
  },
  async clearAll() {
    ['homework', 'wrong', 'weak'].forEach((k) => localStorage.removeItem(this._p + k));
  }
};
