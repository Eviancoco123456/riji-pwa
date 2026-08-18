const app = {
  currentDate: null,

  async init() {
    await Store.init();
    this.currentDate = Homework.getTodayDate();
    this.bindNav();
    this.bindUpload();
    this.bindBackup();
    this.bindDateNav();
    this.renderToday();
    this.registerSW();
  },

  registerSW() {
    // 极简 SW：只用于 PWA 可安装，业务资源一律走网络（不缓存），杜绝旧代码
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  },

  bindNav() {
    document.querySelectorAll('.bottom-nav .nav-item').forEach((btn) => {
      btn.addEventListener('click', () => this.go(btn.dataset.page));
    });
  },

  go(page) {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.bottom-nav .nav-item').forEach((b) => b.classList.remove('active'));
    const nav = document.querySelector(`.bottom-nav .nav-item[data-page="${page}"]`);
    if (nav) nav.classList.add('active');
    if (page === 'wrongbook') this.renderWrongbook();
    if (page === 'weakpoints') this.renderWeakpoints();
    if (page === 'feedback') this.renderFeedback();
  },

  bindUpload() {
    const input = document.getElementById('file-input');
    const capture = document.getElementById('file-capture');
    const preview = document.getElementById('parse-preview');
    const list = document.getElementById('parse-items');
    const loading = document.getElementById('parse-loading');
    const tip = document.getElementById('parse-tip');

    const onFile = async (file) => {
      if (!file) return;
      loading.classList.remove('hidden');
      preview.classList.add('hidden');
      try {
        const items = await Homework.parseImage(file);
        this.renderParseItems(items);
        tip.textContent = '✅ 千问视觉识别成功，共 ' + items.length + ' 项。请核对后保存。';
        preview.classList.remove('hidden');
      } catch (e) {
        this.renderParseItems([]);
        tip.textContent = '⚠️ 识别失败：' + (e && e.message ? e.message : e) + '。可点「+ 手动添加」逐条录入。';
        preview.classList.remove('hidden');
      } finally {
        loading.classList.add('hidden');
      }
    };

    document.getElementById('btn-capture').onclick = () => capture.click();
    document.getElementById('btn-pick').onclick = () => input.click();
    input.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; onFile(f); };
    capture.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; onFile(f); };

    document.getElementById('btn-add-row').onclick = () => {
      const row = document.createElement('div');
      row.className = 'parse-row';
      row.innerHTML = this._rowHTML({ subject: '其他', type: '作业', content: '' });
      list.appendChild(row);
    };

    document.getElementById('btn-save-homework').onclick = async () => {
      const rows = list.querySelectorAll('.parse-row');
      const items = [];
      rows.forEach((row) => {
        const content = row.querySelector('.p-content').value.trim();
        if (!content) return;
        items.push({
          subject: row.querySelector('.p-subject').value,
          type: row.querySelector('.p-type').value,
          content
        });
      });
      if (!items.length) { alert('请至少填写一条作业内容'); return; }
      const norm = Homework.normalize(items);
      await Homework.createFromItems(norm, this.currentDate);
      preview.classList.add('hidden');
      this.renderToday();
    };
  },

  _rowHTML(it) {
    const subjects = Homework.subjects.map((s) => `<option value="${s}" ${s === it.subject ? 'selected' : ''}>${s}</option>`).join('');
    const types = Homework.types.map((t) => `<option value="${t}" ${t === it.type ? 'selected' : ''}>${t}</option>`).join('');
    return `<select class="p-subject">${subjects}</select><select class="p-type">${types}</select><input class="p-content" type="text" value="${it.content || ''}" placeholder="作业内容" />`;
  },

  renderParseItems(items) {
    const list = document.getElementById('parse-items');
    list.innerHTML = '';
    items.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'parse-row';
      row.innerHTML = this._rowHTML(it);
      list.appendChild(row);
    });
    if (!items.length) {
      const row = document.createElement('div');
      row.className = 'parse-row';
      row.innerHTML = this._rowHTML({ subject: '其他', type: '作业', content: '' });
      list.appendChild(row);
    }
  },

  async renderToday() {
    const target = this.currentDate;
    const labelInfo = this.formatDateLabel(target);
    document.getElementById('today-label').textContent = labelInfo.label;
    document.getElementById('today-date').textContent = labelInfo.date;
    const hw = await Store.getHomeworkByDate(target);
    const listEl = document.getElementById('today-list');
    const emptyEl = document.getElementById('today-empty');
    const summaryEl = document.getElementById('today-summary');

    if (!hw || !hw.items.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      summaryEl.innerHTML = '';
      return;
    }
    emptyEl.classList.add('hidden');
    const passed = hw.items.filter((i) => i.passStatus === 'passed').length;
    const failed = hw.items.filter((i) => i.passStatus === 'failed').length;
    const pending = hw.items.length - passed - failed;
    summaryEl.innerHTML = `
      <div class="summary-card s-pending"><span class="num">${pending}</span><span>待完成</span></div>
      <div class="summary-card s-passed"><span class="num">${passed}</span><span>作对</span></div>
      <div class="summary-card s-failed"><span class="num">${failed}</span><span>错/空白</span></div>`;

    listEl.innerHTML = hw.items.map((it) => {
      const cls = it.passStatus === 'passed' ? 'passed' : it.passStatus === 'failed' ? 'failed' : 'pending';
      const txt = it.passStatus === 'passed' ? '作对' : it.passStatus === 'failed' ? '错/空白' : (it.status === 'done' ? '待批改' : '未完成');
      const aiBadge = it.aiJudge === 'correct' ? '<span class="ai-judge correct">AI 对</span>'
        : it.aiJudge === 'wrong' ? '<span class="ai-judge wrong">AI 错</span>'
        : it.aiJudge === 'unknown' ? '<span class="ai-judge unknown">AI 待判</span>' : '';
      const timeMeta = (it.uploadedAt || it.completedAt)
        ? `<div class="hw-time">${it.uploadedAt ? '📷 ' + this.formatTime(it.uploadedAt) : ''}${(it.uploadedAt && it.completedAt) ? ' · ' : ''}${it.completedAt ? '✅ ' + this.formatTime(it.completedAt) : ''}</div>`
        : '';
      return `
        <div class="hw-item ${cls}">
          <div class="hw-top">
            <span class="hw-subject">${it.subject}</span><span class="hw-type">${it.type}</span>
            ${aiBadge}
            <span class="hw-status ${cls}">${txt}</span>
          </div>
          <div class="hw-content">${it.content}</div>
          ${(it.aiStudentAnswer || it.aiReference) ? `<div class="hw-ref">${it.aiStudentAnswer ? '<b>你的：</b>' + it.aiStudentAnswer + (it.aiReference ? '<br>' : '') : ''}${it.aiReference ? '<b>参考答案：</b>' + it.aiReference : ''}</div>` : ''}
          ${it.image_url ? `<img class="hw-thumb" src="${it.image_url}" alt="作业图" />` : ''}
          ${timeMeta}
          <div class="hw-actions">
            <button class="btn btn-small btn-primary" onclick="Grading.open('${it.id}')">${it.status === 'done' ? '查看/修改批改' : '去批改'}</button>
            <button class="btn btn-small btn-outline" onclick="app.uploadItemImage('${it.id}')">📷 上传作业图</button>
          </div>
        </div>`;
    }).join('');
  },

  async uploadItemImage(itemId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const loading = document.getElementById('item-grade-loading');
      if (loading) loading.classList.remove('hidden');
      try {
        const url = await Store.uploadImage(file);
        const hw = await Store.getHomeworkByDate(this.currentDate);
        const it = hw && hw.items.find((x) => x.id === itemId);
        if (!it) return;
        it.image_url = url;
        if (!it.uploadedAt) it.uploadedAt = new Date().toISOString();
        // 用千问批改这一条作业（识别作答 + 判对错 + 给参考答案）
        const res = await Homework.gradeItemImage(file, it);
        it.aiStudentAnswer = res.studentAnswer || it.aiStudentAnswer || '';
        it.aiReference = res.reference || res.answer || '';
        it.aiJudge = res.judge || 'unknown';
        if (res.judge && res.judge !== 'unknown') {
          const correct = res.judge === 'correct';
          it.passStatus = correct ? 'passed' : 'failed';
          it.status = 'done';
          it.studentAnswer = it.studentAnswer || res.studentAnswer || '';
          it.answer = it.answer || res.answer || res.reference || '';
          if (!correct) {
            // 判错/空白 → 自动记入错题库 + 薄弱点
            const reason = (!res.studentAnswer) ? '空白/未完成' : '答错';
            await Store.addWrong({
              itemId: it.id, subject: it.subject, subSubject: it.subSubject, type: it.type,
              content: it.content, knowledgePoint: it.content, reason: reason,
              answer: it.answer, studentAnswer: res.studentAnswer || '（空白）', masteryStatus: '薄弱', date: this.currentDate
            });
            await Store.upsertWeak({
              subject: it.subject, subSubject: it.subSubject, knowledgePoint: it.content,
              firstDate: this.currentDate, lastDate: this.currentDate, status: '薄弱'
            });
          } else {
            // 判对 → 累计作对次数（满 3 才移出错题库）
            await Store.recordCorrect(it.id, this.currentDate);
          }
        }
        it.completedAt = new Date().toISOString();
        await Store.saveHomework(hw);
        this.renderToday();
        this.renderWrongbook();
        this.renderWeakpoints();
        if (res.judge === 'wrong') alert('✅ 已批改：判为「错/空白」，已记入错题库与薄弱点。');
        else if (res.judge === 'correct') alert('✅ 已批改：判为「作对」。');
        else alert('ℹ️ 千问未能判定对错（图中可能无作答），已保存图片，可点「去批改」手动录入。');
      } catch (e) {
        alert('批改失败：' + (e && e.message ? e.message : e));
      } finally {
        if (loading) loading.classList.add('hidden');
      }
    };
    input.click();
  },

  bindBackup() {
    const exp = document.getElementById('btn-export');
    const imp = document.getElementById('btn-import');
    const file = document.getElementById('file-import');
    if (exp) exp.onclick = () => this.exportData();
    if (imp) imp.onclick = () => file && file.click();
    if (file) file.onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) this.importData(f);
    };
  },

  async exportData() {
    try {
      const data = await Store.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = this.currentDate || new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = '日迹题库备份_' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      alert('✅ 题库已导出为 JSON 文件。请把它保存到手机/电脑（如微信收藏、云盘、备忘录），换设备或换链接时用「导入题库」恢复即可。');
    } catch (e) {
      alert('导出失败：' + (e && e.message ? e.message : e));
    }
  },

  async importData(file) {
    if (!confirm('导入会用备份文件覆盖当前设备的题库。确定继续？\n（建议先点「导出题库」备份当前数据）')) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const r = await Store.importAll(data);
      this.renderToday();
      this.renderWrongbook();
      this.renderWeakpoints();
      alert('✅ 导入成功：作业 ' + r.homework + ' 条 · 错题 ' + r.wrong + ' 条 · 薄弱点 ' + r.weak + ' 条。');
    } catch (e) {
      alert('导入失败：' + (e && e.message ? e.message : e));
    }
  },

  bindDateNav() {
    document.getElementById('date-prev').onclick = () => this.shiftDate(-1);
    document.getElementById('date-next').onclick = () => this.shiftDate(1);
  },

  shiftDate(delta) {
    const [Y, M, D] = this.currentDate.split('-').map(Number);
    const d = new Date(Y, M - 1, D + delta);
    this.currentDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    this.renderToday();
  },

  renderWrongbook() { Wrongbook.render(); },
  renderWeakpoints() { Weakpoints.render(); },

  formatDateLabel(dateStr) {
    const today = Homework.getTodayDate();
    if (dateStr === today) return { label: '今天', date: this.prettyDate(dateStr) };
    const [Y, M, D] = today.split('-').map(Number);
    const y = new Date(Y, M - 1, D - 1);
    const yStr = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    if (dateStr === yStr) return { label: '昨天', date: this.prettyDate(dateStr) };
    return { label: '作业日', date: this.prettyDate(dateStr) };
  },

  prettyDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + w;
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  },

  // 每日反馈：基于当前所选日期的作业记录，给出学科对错分布、薄弱点与完成时间轴
  async renderFeedback() {
    const el = document.getElementById('feedback-list');
    if (!el) return;
    const date = this.currentDate;
    const hw = await Store.getHomeworkByDate(date);
    const items = hw ? hw.items : [];
    const head = this.formatDateLabel(date).label + ' · ' + this.prettyDate(date);
    if (!items.length) {
      el.innerHTML = '<p class="empty">这一天还没有作业记录。在「今日」页上传并批改作业后，这里会自动生成反馈。</p>';
      return;
    }
    // 按学科聚合
    const bySubj = {};
    items.forEach((it) => {
      const s = it.subject || '其他';
      if (!bySubj[s]) bySubj[s] = { subject: s, total: 0, passed: 0, failed: 0, pending: 0 };
      bySubj[s].total++;
      if (it.passStatus === 'passed') bySubj[s].passed++;
      else if (it.passStatus === 'failed') bySubj[s].failed++;
      else bySubj[s].pending++;
    });
    const subs = Object.keys(bySubj);
    let worst = null, best = null, bestRate = -1;
    subs.forEach((s) => {
      const st = bySubj[s];
      if (!worst || st.failed > bySubj[worst].failed) worst = s;
      if (st.passed > 0) {
        const rate = st.passed / st.total;
        if (rate >= bestRate) { bestRate = rate; best = s; }
      }
    });
    const total = items.length;
    const passed = items.filter((i) => i.passStatus === 'passed').length;
    const failed = items.filter((i) => i.passStatus === 'failed').length;
    const pending = total - passed - failed;
    const weakToday = items.filter((i) => i.passStatus === 'failed');
    const timeline = items.filter((i) => i.completedAt).slice().sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));

    const subjRows = subs.map((s) => {
      const st = bySubj[s];
      const rate = st.total ? Math.round((st.passed / st.total) * 100) : 0;
      const barColor = rate >= 80 ? 'var(--green)' : rate >= 50 ? 'var(--amber)' : 'var(--red)';
      return `
        <div class="fb-subj">
          <div class="fb-subj-head"><span class="tag tag-${s}">${s}</span>
            <span class="fb-subj-rate" style="color:${barColor}">正确率 ${rate}%</span></div>
          <div class="fb-bar"><div class="fb-bar-fill" style="width:${rate}%;background:${barColor}"></div></div>
          <div class="fb-subj-num">共 ${st.total} · 作对 ${st.passed} · 错/空白 ${st.failed}${st.pending ? ' · 待批改 ' + st.pending : ''}</div>
        </div>`;
    }).join('');

    const weakHtml = weakToday.length
      ? weakToday.map((i) => `<div class="fb-weak-item"><span class="tag tag-${i.subject}">${i.subject}</span><span>${i.content}</span></div>`).join('')
      : '<p class="fb-none">今天没有判错的作业，表现不错 🎉</p>';

    const tlHtml = timeline.length
      ? timeline.map((i) => `<div class="fb-tl-item"><span class="fb-tl-time">${this.formatTime(i.completedAt)}</span><span class="tag tag-${i.subject}">${i.subject}</span><span class="fb-tl-content">${i.content}</span></div>`).join('')
      : '<p class="fb-none">还没有记录到完成时间（上传作业图或去批改后即记录）。</p>';

    el.innerHTML = `
      <div class="fb-head">${head}</div>
      <div class="summary">
        <div class="summary-card"><span class="num">${total}</span><span>作业项</span></div>
        <div class="summary-card s-passed"><span class="num">${passed}</span><span>作对</span></div>
        <div class="summary-card s-failed"><span class="num">${failed}</span><span>错/空白</span></div>
        <div class="summary-card s-pending"><span class="num">${pending}</span><span>待批改</span></div>
      </div>
      <div class="fb-highlight">
        ${worst ? `<div class="fb-hl-card hl-bad"><div class="fb-hl-label">⚠️ 错误较多</div><div class="fb-hl-subj">${worst}</div><div class="fb-hl-desc">共 ${bySubj[worst].failed} 项未作出正确答案</div></div>` : ''}
        ${best ? `<div class="fb-hl-card hl-good"><div class="fb-hl-label">✅ 表现较好</div><div class="fb-hl-subj">${best}</div><div class="fb-hl-desc">正确率 ${Math.round((bySubj[best].passed / bySubj[best].total) * 100)}%</div></div>` : ''}
      </div>
      <h3 class="fb-section">各科明细</h3>
      <div class="fb-subj-list">${subjRows}</div>
      <h3 class="fb-section">薄弱知识点（当日判错）</h3>
      <div class="fb-weak">${weakHtml}</div>
      <h3 class="fb-section">完成时间轴</h3>
      <div class="fb-tl">${tlHtml}</div>
    `;
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
