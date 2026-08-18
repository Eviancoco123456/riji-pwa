// 批改：录入作答与正确答案，未达标自动进错题库 + 薄弱点
const Grading = {
  _modal: null,

  async open(itemId) {
    const hw = await Store.getHomeworkByDate(app.currentDate);
    const it = hw && hw.items.find((x) => x.id === itemId);
    if (!it) return;
    this._show(it);
  },

  _show(it) {
    this._close();
    // 千问上传即批改：若 AI 已读出作答/答案/判定，预填以减少手动输入
    const prefillStudent = it.studentAnswer || it.aiStudentAnswer || '';
    const prefillAnswer = it.answer || it.aiReference || '';
    const defaultCorrect = it.passStatus === 'passed' || it.aiJudge === 'correct';
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal">
        <h3>批改 · ${it.subject} / ${it.type}</h3>
        <p class="item-content">${it.content}</p>
        <label>你的作答 / 情况
          <textarea id="g-student" rows="2" placeholder="填写实际作答或「空白」">${prefillStudent}</textarea>
        </label>
        <label>正确答案
          <textarea id="g-answer" rows="2" placeholder="填写正确答案">${prefillAnswer}</textarea>
        </label>
        <label>作答情况（是否作出正确答案）
          <select id="g-pass">
            <option value="correct" ${defaultCorrect ? 'selected' : ''}>作对了（有正确答案）</option>
            <option value="wrong" ${defaultCorrect ? '' : 'selected'}>错 / 空白 / 未完成</option>
          </select>
        </label>
        <div class="form-actions">
          <button class="btn btn-outline" id="g-cancel">取消</button>
          <button class="btn btn-primary" id="g-save">保存</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    this._modal = ov;
    ov.addEventListener('click', (e) => { if (e.target === ov) this._close(); });
    ov.querySelector('#g-cancel').onclick = () => this._close();
    ov.querySelector('#g-save').onclick = () => this._submit(it);
  },

  async _submit(it) {
    const studentAnswer = document.getElementById('g-student').value.trim();
    const answer = document.getElementById('g-answer').value.trim();
    // 判定依据：该题是否"作出正确答案"。选「错/空白/未完成」即视为未作出正确答案。
    const correct = document.getElementById('g-pass').value === 'correct';
    const hw = await Store.getHomeworkByDate(app.currentDate);
    const target = hw.items.find((x) => x.id === it.id);
    if (!target) return;
    target.studentAnswer = studentAnswer;
    target.answer = answer;
    target.passStatus = correct ? 'passed' : 'failed';
    target.status = 'done';
    if (!target.completedAt) target.completedAt = new Date().toISOString();
    await Store.saveHomework(hw);
    if (!correct) {
      // 未作出正确答案（答错 或 空白/未完成）→ 进错题库 + 薄弱点（累计错误次数与日期）
      const isBlank = !studentAnswer || /^(空白|未完成|未做|没做|空|无)$/.test(studentAnswer);
      const reason = isBlank ? '空白/未完成' : '答错';
      await Store.addWrong({
        itemId: target.id,
        subject: target.subject,
        subSubject: target.subSubject,
        type: target.type,
        content: target.content,
        knowledgePoint: target.content,
        reason: reason,
        answer: answer,
        studentAnswer: studentAnswer || '（空白）',
        masteryStatus: '薄弱',
        date: app.currentDate
      });
      await Store.upsertWeak({
        subject: target.subject,
        subSubject: target.subSubject,
        knowledgePoint: target.content,
        firstDate: app.currentDate,
        lastDate: app.currentDate,
        status: '薄弱'
      });
    } else {
      // 作出正确答案：累加作对次数，满 3 次才移出错题库（薄弱点保留作历史记录）
      const r = await Store.recordCorrect(it.id, app.currentDate);
      if (r.removed) {
        alert('✅ 该题已作对满 3 次，已从错题库移出。');
      }
    }
    this._close();
    app.renderToday();
    app.renderWrongbook();
    app.renderWeakpoints();
  },

  _close() {
    if (this._modal) { this._modal.remove(); this._modal = null; }
  }
};
