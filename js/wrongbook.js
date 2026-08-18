// 错题库
const Wrongbook = {
  async render() {
    const listEl = document.getElementById('wrong-list');
    const sumEl = document.getElementById('wrong-summary');
    if (!listEl) return;
    const items = await Store.loadWrong();
    if (!items.length) {
      if (sumEl) sumEl.innerHTML = '';
      listEl.innerHTML = '<p class="empty">还没有错题。拍照/选图上传作业后，日迹会用千问判定每题对错；判为「错/空白」并在「去批改」确认后自动收录到这里。</p>';
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
          listEl.querySelectorAll('.wrong-item').forEach((card) => {
            card.style.display = (s === '__all' || card.dataset.subject === s) ? '' : 'none';
          });
          sumEl.querySelectorAll('.subj-chip').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
        };
      });
    }
    listEl.innerHTML = items
      .slice()
      .reverse()
      .map((w) => {
        const dates = (w.errorDates && w.errorDates.length ? w.errorDates : [w.date])
          .map((d) => `<span class="err-date">${d}</span>`).join('');
        const need = Math.max(0, 3 - (w.correctCount || 0));
        const prog = need > 0 ? `再作对 ${need} 次移出错题库` : '已可作对满 3 次';
        return `
        <div class="card wrong-item" data-subject="${w.subject || '其他'}">
          <div class="card-top">
            <span class="tag tag-${w.subject || '其他'}">${w.subject || '其他'}${w.subSubject ? '·' + w.subSubject : ''}</span>
            <span class="tag tag-type">${w.type || ''}</span>
            <span class="tag tag-reason">${w.reason || ''}</span>
          </div>
          <div class="card-content">${w.content || ''}</div>
          <div class="card-qa">
            <div><b>你的：</b>${w.studentAnswer || '（空白）'}</div>
            <div><b>正确：</b>${w.answer || ''}</div>
          </div>
          <div class="card-err">❌ 错误 <b>${w.errorCount || 1}</b> 次 · ${prog}</div>
          <div class="card-dates">出错日期：${dates}</div>
          <div class="card-foot">
            <span>📅 最近 ${w.date || ''}</span>
            <button class="btn btn-small btn-outline" onclick="Wrongbook.remove('${w.id}')">删除</button>
          </div>
        </div>`;
      })
      .join('');
  },

  async remove(id) {
    if (!confirm('确定删除这条错题？')) return;
    await Store.removeWrong(id);
    this.render();
  }
};
