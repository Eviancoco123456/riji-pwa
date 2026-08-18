// 薄弱点集合（由错题自动聚合）
const Weakpoints = {
  async render() {
    const listEl = document.getElementById('weak-list');
    const sumEl = document.getElementById('weak-summary');
    if (!listEl) return;
    const items = await Store.loadWeak();
    if (!items.length) {
      if (sumEl) sumEl.innerHTML = '';
      listEl.innerHTML = '<p class="empty">还没有薄弱点。错题会按知识点自动聚合成薄弱点。</p>';
      return;
    }
    // 顶部各科数量统计（点击筛选）
    const counts = {};
    items.forEach((w) => { const s = w.subject || '其他'; counts[s] = (counts[s] || 0) + 1; });
    const subjects = Object.keys(counts);
    if (sumEl) {
      sumEl.innerHTML =
        '<div class="subj-sum">' +
        subjects.map((s) => `<button class="subj-chip" data-subj="${s}">${s} <b>${counts[s]}</b></button>`).join('') +
        `<button class="subj-chip active" data-subj="__all">全部 <b>${items.length}</b></button></div>`;
      sumEl.querySelectorAll('.subj-chip').forEach((b) => {
        b.onclick = () => {
          const s = b.dataset.subj;
          listEl.querySelectorAll('.weak-item').forEach((card) => {
            card.style.display = (s === '__all' || card.dataset.subject === s) ? '' : 'none';
          });
          sumEl.querySelectorAll('.subj-chip').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
        };
      });
    }
    listEl.innerHTML = items
      .slice()
      .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
      .map((w) => {
        const dates = (w.dates || []).map((d) => `<span class="err-date">${d}</span>`).join('');
        return `
        <div class="card weak-item" data-subject="${w.subject || '其他'}">
          <div class="card-top">
            <span class="tag tag-${w.subject || '其他'}">${w.subject || '其他'}${w.subSubject ? '·' + w.subSubject : ''}</span>
            <span class="tag tag-freq">出现 ${w.frequency || 1} 次</span>
          </div>
          <div class="card-content">${w.knowledgePoint || ''}</div>
          <div class="card-dates">出错日期：${dates}</div>
          <div class="card-foot"><span>最近：${w.lastDate || ''}</span></div>
        </div>`;
      })
      .join('');
  }
};
