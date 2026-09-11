/**
 * test.js — Engine for standard practice tests (redesigned)
 */

const TestEngine = {
  questions:    [],
  currentIndex: 0,
  correctCount: 0,
  wrongCount:   0,
  answered:     [],   // bool per question
  timerInterval: null,
  timeLeft:      0,

  // ── Init ─────────────────────────────────────────────────────
  async init() {
    if (!window.EXAM_CONFIG) return;
    Progress.clearAttempts();

    const { category, difficulty, limit, timed, time_limit } = window.EXAM_CONFIG;

    try {
      const url = `/api/questions?category=${category}&difficulty=${difficulty}&limit=${limit}`;
      const res = await fetch(url);
      this.questions = await res.json();

      if (this.questions.length === 0) {
        document.getElementById('loadingState').innerHTML = `
          <div style="text-align:center;padding:var(--space-10)">
            <div style="font-size:3rem;margin-bottom:var(--space-4)">😔</div>
            <h3>Nessuna domanda trovata</h3>
            <p style="margin:var(--space-4) 0 var(--space-6)">Non ci sono domande per questa combinazione di filtri.</p>
            <a href="/test" class="btn btn-primary">← Torna alla configurazione</a>
          </div>`;
        return;
      }

      this.answered = new Array(this.questions.length).fill(false);

      // Show UI
      document.getElementById('loadingState').classList.add('hidden');
      document.getElementById('examStickyBar').classList.remove('hidden');
      document.getElementById('examBody').classList.remove('hidden');
      document.getElementById('questionCard').classList.remove('hidden');
      document.getElementById('examNav').classList.remove('hidden');

      document.getElementById('qTotal').textContent = this.questions.length;

      // Category / difficulty badges
      const catMap = {
        mixed:'🔀 Misto', grammar:'📝 Grammatica', vocabulary:'📚 Vocabolario',
        verbs:'🔤 Verbi', prepositions:'🔗 Preposizioni', pronouns:'👤 Pronomi', reading:'📖 Comprensione'
      };
      const diffMap = { all:'🌟 Tutti i livelli', easy:'🟢 Facile', medium:'🟡 Medio', hard:'🔴 Difficile' };

      document.getElementById('catLabel').textContent  = catMap[category]   || category;
      document.getElementById('diffLabel').textContent = diffMap[difficulty] || difficulty;

      // Nav dots
      this._buildNavDots();

      // Timer
      if (timed && time_limit > 0) {
        this.startTimer(time_limit);
      }

      this.showQuestion(0);

    } catch (e) {
      console.error(e);
      document.getElementById('loadingState').innerHTML = `
        <div style="text-align:center;padding:var(--space-10)">
          <div style="font-size:3rem;margin-bottom:var(--space-4)">⚠️</div>
          <p style="color:var(--error)">Errore nel caricamento delle domande.<br>Riprova più tardi.</p>
        </div>`;
    }
  },

  // ── Nav dots ─────────────────────────────────────────────────
  _buildNavDots() {
    const wrap = document.getElementById('navDots');
    wrap.innerHTML = '';
    this.questions.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'nav-dot';
      dot.id = `navDot-${i}`;
      dot.title = `Domanda ${i + 1}`;
      dot.onclick = () => this.showQuestion(i);
      wrap.appendChild(dot);
    });
  },

  _updateNavDots() {
    this.questions.forEach((q, i) => {
      const dot = document.getElementById(`navDot-${i}`);
      if (!dot) return;
      dot.className = 'nav-dot';
      if (i === this.currentIndex) {
        dot.classList.add('current');
      } else if (this.answered[i]) {
        const wasCorrect = q.selectedAnswer === q.correct_answer;
        dot.classList.add(wasCorrect ? 'correct' : 'wrong');
      }
    });
  },

  // ── Timer ─────────────────────────────────────────────────────
  startTimer(seconds) {
    this.timeLeft = seconds;
    const display = document.getElementById('timerDisplay');
    display.classList.remove('hidden');
    this._renderTimer();

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this._renderTimer();
      const d = document.getElementById('timerDisplay');
      d.className = 'exam-timer-pill';
      if (this.timeLeft <= 60)  d.classList.add('warning');
      if (this.timeLeft <= 10)  { d.classList.remove('warning'); d.classList.add('danger'); }
      if (this.timeLeft <= 0)   { clearInterval(this.timerInterval); this.finishTest(true); }
    }, 1000);
  },

  _renderTimer() {
    const m = Math.floor(this.timeLeft / 60).toString().padStart(2, '0');
    const s = (this.timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('timerValue').textContent = `${m}:${s}`;
  },

  // ── Show question ─────────────────────────────────────────────
  showQuestion(index) {
    this.currentIndex = index;
    const q = this.questions[index];

    // Update counter & progress
    document.getElementById('qCurrent').textContent = index + 1;
    const pct = (index / this.questions.length) * 100;
    const el = document.getElementById('examProgress');
    el.style.width = `${pct}%`;
    el.setAttribute('aria-valuenow', Math.round(pct));

    // Meta badges
    document.getElementById('qBadge').textContent   = `#${index + 1}`;
    document.getElementById('diffBadge').textContent = q.difficulty;
    document.getElementById('diffBadge').className   = `badge badge-${q.difficulty}`;
    document.getElementById('catBadge').textContent  = q.category;

    // Question text
    document.getElementById('questionText').innerHTML = q.question;

    // Options
    const optContainer = document.getElementById('optionsList');
    optContainer.innerHTML = '';
    const letters = ['A','B','C','D','E'];

    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.id = `opt-${i}`;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.innerHTML = `<span class="option-letter">${letters[i]}</span><span>${opt}</span>`;

      if (this.answered[index]) {
        btn.disabled = true;
        if (i === q.selectedAnswer) {
          btn.classList.add(q.selectedAnswer === q.correct_answer ? 'correct' : 'incorrect');
          btn.setAttribute('aria-checked', 'true');
        } else if (i === q.correct_answer) {
          btn.classList.add('revealed-correct');
        }
      } else {
        btn.onclick = () => this.selectAnswer(i);
      }
      optContainer.appendChild(btn);
    });

    // Explanation
    const expBox = document.getElementById('explanationBox');
    if (this.answered[index]) {
      const wasCorrect = q.selectedAnswer === q.correct_answer;
      expBox.className = 'explanation-box show ' + (wasCorrect ? 'correct-exp' : 'incorrect-exp');
      document.getElementById('expIcon').textContent = wasCorrect ? '✅' : '❌';
      document.getElementById('expTitle').innerHTML  = wasCorrect
        ? '<span class="explanation-result correct-label">Corretto! Ottimo lavoro.</span>'
        : `<span class="explanation-result wrong-label">Sbagliato.</span> La risposta corretta è: <strong>${q.options[q.correct_answer]}</strong>`;
      document.getElementById('expText').textContent = q.explanation || '';
    } else {
      expBox.className = 'explanation-box';
    }

    // Nav dots
    this._updateNavDots();

    // Prev/Next buttons
    document.getElementById('prevBtn').disabled = index === 0;
    const nextBtn = document.getElementById('nextBtn');
    if (index === this.questions.length - 1) {
      nextBtn.textContent = '✅ Termina test';
      nextBtn.className   = 'btn btn-accent';
    } else {
      nextBtn.textContent = 'Prossima →';
      nextBtn.className   = 'btn btn-primary';
    }

    // Animate card
    const card = document.getElementById('questionCard');
    card.style.animation = 'none';
    void card.offsetHeight; // reflow
    card.style.animation = 'qSlideIn .3s cubic-bezier(.2,.8,.4,1)';
  },

  // ── Select answer ─────────────────────────────────────────────
  selectAnswer(selectedIdx) {
    if (this.answered[this.currentIndex]) return;

    const q = this.questions[this.currentIndex];
    q.selectedAnswer = selectedIdx;
    this.answered[this.currentIndex] = true;

    const wasCorrect = selectedIdx === q.correct_answer;
    if (wasCorrect) {
      this.correctCount++;
      document.getElementById('scoreCorrect').textContent = `✓ ${this.correctCount}`;
    } else {
      this.wrongCount++;
      document.getElementById('scoreWrong').textContent = `✗ ${this.wrongCount}`;
    }

    Progress.recordAttempt(q.id, wasCorrect);

    // Re-render with feedback
    this.showQuestion(this.currentIndex);

    // Auto-finish if all answered
    if (this.answered.every(a => a)) {
      setTimeout(() => this.finishTest(false), 1800);
    }
  },

  // ── Navigation ────────────────────────────────────────────────
  prev() {
    if (this.currentIndex > 0) this.showQuestion(this.currentIndex - 1);
  },

  next() {
    if (this.currentIndex < this.questions.length - 1) {
      this.showQuestion(this.currentIndex + 1);
    } else {
      this.finishTest(false);
    }
  },

  // ── Finish test ───────────────────────────────────────────────
  async finishTest(timeExpired) {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const total    = this.questions.length;
    const correct  = this.correctCount;
    const scorePct = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Hide exam UI
    document.getElementById('examStickyBar').classList.add('hidden');
    document.getElementById('examBody').classList.add('hidden');

    // Show completion
    const compScreen = document.getElementById('completionScreen');
    compScreen.classList.remove('hidden');

    // Populate header
    document.getElementById('correctCount').textContent = correct;
    document.getElementById('totalCount').textContent   = total;

    const gradeEl = document.getElementById('gradeText');
    const emoji   = document.getElementById('resultEmoji');
    const arc     = document.getElementById('scoreArc');

    // Score arc colour
    let arcColor = 'var(--primary)';
    if (scorePct >= 90) { gradeEl.textContent = 'Eccellente! 🏆'; gradeEl.className = 'grade-text excellent'; emoji.textContent = '🏆'; arcColor = 'var(--success)'; }
    else if (scorePct >= 75) { gradeEl.textContent = 'Ottimo lavoro!'; gradeEl.className = 'grade-text good'; emoji.textContent = '🌟'; arcColor = 'var(--primary)'; }
    else if (scorePct >= 60) { gradeEl.textContent = 'Sufficiente';    gradeEl.className = 'grade-text average'; emoji.textContent = '👍'; arcColor = 'var(--warning)'; }
    else { gradeEl.textContent = 'Bisogna migliorare'; gradeEl.className = 'grade-text poor'; emoji.textContent = '📚'; arcColor = 'var(--error)'; }

    arc.style.stroke = arcColor;

    // Animate score circle
    const circumference = 490.1;
    setTimeout(() => {
      arc.style.strokeDashoffset = circumference - (circumference * scorePct / 100);

      let curr = 0;
      const interval = setInterval(() => {
        curr += 2;
        if (curr >= scorePct) { curr = scorePct; clearInterval(interval); }
        document.getElementById('scoreValue').textContent = curr;
      }, 20);
    }, 200);

    // Category breakdown
    const catCounts = {};
    this.questions.forEach(q => {
      const cat = q.category || 'mixed';
      if (!catCounts[cat]) catCounts[cat] = { total: 0, correct: 0 };
      catCounts[cat].total++;
      if (q.selectedAnswer === q.correct_answer) catCounts[cat].correct++;
    });

    const bdWrap = document.getElementById('breakdown');
    const cats   = Object.keys(catCounts);
    if (cats.length > 1) {
      let html = '';
      cats.forEach(cat => {
        const d   = catCounts[cat];
        const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
        const barColor = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--error)';
        html += `
          <div class="cat-row">
            <span class="cat-row-name">${cat}</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${barColor};transition:width 1s .4s ease;"></div></div>
            <span class="cat-row-pct" style="color:${barColor};">${pct}%</span>
          </div>`;
      });
      bdWrap.innerHTML = html;
    } else {
      document.getElementById('breakdownWrap').style.display = 'none';
    }

    // Confetti on high score
    if (scorePct >= 75) {
      this._confetti();
    }

    // Toast if timed out
    if (timeExpired) {
      showToast('⏰ Tempo scaduto! Il test è stato consegnato.', 'warning');
    }

    // Submit to backend
    const res = await Progress.submitTestResult(
      window.EXAM_CONFIG.category,
      window.EXAM_CONFIG.difficulty,
      total, correct, scorePct
    );

    // Weak areas from server response
    if (res && res.weak_areas && res.weak_areas.length > 0) {
      let html = `<div class="weak-box"><h4>⚠️ Aree da ripassare</h4>`;
      res.weak_areas.forEach(a => {
        html += `<div class="weak-item">
          <span class="weak-item-cat">${a.category}</span>
          <span class="weak-item-pct">${a.accuracy}%</span>
        </div>`;
      });
      html += `</div>`;
      document.getElementById('weakAreasResult').innerHTML = html;
    }
  },

  // ── Confetti ──────────────────────────────────────────────────
  _confetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#1a7f4b','#009246','#ce2b37','#FFD700','#4169e1','#ff6b35'];
    for (let i = 0; i < 150; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        w: 8 + Math.random() * 8,
        h: 5 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - .5) * .2,
        vx: (Math.random() - .5) * 3,
        vy: 2 + Math.random() * 4,
        opacity: 1,
      });
    }

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        if (frame > 120) p.opacity = Math.max(0, p.opacity - .012);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < 220) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    requestAnimationFrame(draw);
  },

  // ── Restart ───────────────────────────────────────────────────
  restart() {
    window.location.reload();
  }
};

// Initialize
if (document.getElementById('examPage')) {
  TestEngine.init();
}
