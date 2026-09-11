/**
 * simulation.js — Engine for the final 50-question mock exam
 */

const SimEngine = {
  questions: [],
  answers: [],    // user's selected answers
  flagged: [],    // boolean array for "marked for review"
  currentIndex: 0,
  
  timerInterval: null,
  timeLeft: 3600, // 60 minutes

  async start() {
    const btn = document.getElementById('startSimBtn');
    btn.disabled = true;
    btn.textContent = 'Caricamento simulazione...';

    try {
      // We need exactly 50 questions with a specific mix
      // We will fetch 50 mixed questions (assuming the backend randomizes well enough,
      // or we make multiple calls to ensure composition).
      // For simplicity, we make 4 calls to get the exact composition:
      // 20 grammar, 10 vocab, 10 verbs, 10 prepositions/mixed
      
      const resG = await fetch('/api/questions?category=grammar&limit=20');
      const qG = await resG.json();
      
      const resV = await fetch('/api/questions?category=vocabulary&limit=10');
      const qV = await resV.json();
      
      const resVe = await fetch('/api/questions?category=verbs&limit=10');
      const qVe = await resVe.json();
      
      const resM = await fetch('/api/questions?category=prepositions&limit=10');
      let qM = await resM.json();
      
      // Fallback if not enough prepositions, get mixed
      if (qM.length < 10) {
        const resM2 = await fetch(`/api/questions?category=mixed&limit=${10 - qM.length}`);
        const qM2 = await resM2.json();
        qM = qM.concat(qM2);
      }

      this.questions = [...qG, ...qV, ...qVe, ...qM];
      
      // Shuffle the final 50 questions
      this.questions.sort(() => Math.random() - 0.5);
      
      if (this.questions.length < 10) {
        throw new Error("Non ci sono abbastanza domande nel database.");
      }

      this.answers = new Array(this.questions.length).fill(null);
      this.flagged = new Array(this.questions.length).fill(false);

      // Hide briefing, show exam
      document.getElementById('simBriefing').classList.add('hidden');
      document.getElementById('simExam').classList.remove('hidden');
      
      document.getElementById('simQTotal').textContent = this.questions.length;
      
      this.renderNavigator();
      this.startTimer();
      this.showQuestion(0);

    } catch (e) {
      console.error(e);
      alert('Errore nel caricamento della simulazione: ' + e.message);
      btn.disabled = false;
      btn.textContent = '🏆 Inizia la simulazione';
    }
  },

  startTimer() {
    this.updateTimerUI();
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.updateTimerUI();
      
      const timerDisplay = document.getElementById('simTimer');
      if (this.timeLeft <= 300) timerDisplay.classList.add('warning'); // 5 mins
      if (this.timeLeft <= 60) {
        timerDisplay.classList.remove('warning');
        timerDisplay.classList.add('danger');
      }
      
      if (this.timeLeft <= 0) {
        clearInterval(this.timerInterval);
        this.submit(true); // auto submit
      }
    }, 1000);
  },

  updateTimerUI() {
    const m = Math.floor(this.timeLeft / 60).toString().padStart(2, '0');
    const s = (this.timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('simTimerVal').textContent = `${m}:${s}`;
  },

  renderNavigator() {
    const nav = document.getElementById('simNavigator');
    nav.innerHTML = '';
    
    this.questions.forEach((_, i) => {
      const btn = document.createElement('button');
      btn.className = 'q-nav-btn';
      btn.id = `navBtn-${i}`;
      btn.textContent = i + 1;
      btn.onclick = () => this.showQuestion(i);
      nav.appendChild(btn);
    });
    this.updateNavStyles();
  },

  updateNavStyles() {
    let answeredCount = 0;
    this.questions.forEach((_, i) => {
      const btn = document.getElementById(`navBtn-${i}`);
      btn.className = 'q-nav-btn';
      
      if (this.answers[i] !== null) {
        btn.classList.add('answered');
        answeredCount++;
      }
      if (this.flagged[i]) btn.classList.add('flagged');
      if (i === this.currentIndex) btn.classList.add('current');
    });
    
    document.getElementById('simAnsweredCount').textContent = `${answeredCount} / ${this.questions.length} risposte`;
    const pct = (answeredCount / this.questions.length) * 100;
    document.getElementById('simProgress').style.width = `${pct}%`;
  },

  showQuestion(index) {
    this.currentIndex = index;
    const q = this.questions[index];
    
    document.getElementById('simQCurrent').textContent = index + 1;
    document.getElementById('simQBadge').textContent = `Domanda ${index + 1}`;
    document.getElementById('simDiffBadge').textContent = q.difficulty;
    document.getElementById('simDiffBadge').className = `badge badge-${q.difficulty}`;
    document.getElementById('simCatBadge').textContent = q.category;
    
    document.getElementById('simQuestionText').innerHTML = q.question;
    
    const optContainer = document.getElementById('simOptionsList');
    optContainer.innerHTML = '';
    const letters = ['A','B','C','D'];
    
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      if (this.answers[index] === i) btn.classList.add('selected');
      
      btn.innerHTML = `<span class="option-letter">${letters[i]}</span><span>${opt}</span>`;
      btn.onclick = () => this.selectAnswer(i);
      optContainer.appendChild(btn);
    });
    
    // Update buttons
    document.getElementById('simPrevBtn').disabled = index === 0;
    
    const nextBtn = document.getElementById('simNextBtn');
    if (index === this.questions.length - 1) {
      nextBtn.style.visibility = 'hidden';
    } else {
      nextBtn.style.visibility = 'visible';
    }
    
    const flagBtn = document.getElementById('simFlagBtn');
    if (this.flagged[index]) {
      flagBtn.innerHTML = '🚩 Rimuovi bandierina';
      flagBtn.classList.add('text-warning-color');
    } else {
      flagBtn.innerHTML = '🚩 Segna per revisione';
      flagBtn.classList.remove('text-warning-color');
    }
    
    this.updateNavStyles();
  },

  selectAnswer(ansIndex) {
    this.answers[this.currentIndex] = ansIndex;
    
    // Re-render options to show selection
    const optBtns = document.getElementById('simOptionsList').children;
    for (let i = 0; i < optBtns.length; i++) {
      if (i === ansIndex) optBtns[i].classList.add('selected');
      else optBtns[i].classList.remove('selected');
    }
    
    this.updateNavStyles();
    
    // Auto advance if not the last question and not flagged
    if (this.currentIndex < this.questions.length - 1 && !this.flagged[this.currentIndex]) {
      setTimeout(() => this.next(), 400);
    }
  },

  prev() {
    if (this.currentIndex > 0) this.showQuestion(this.currentIndex - 1);
  },

  next() {
    if (this.currentIndex < this.questions.length - 1) this.showQuestion(this.currentIndex + 1);
  },

  flag() {
    this.flagged[this.currentIndex] = !this.flagged[this.currentIndex];
    this.showQuestion(this.currentIndex);
  },

  confirmSubmit() {
    const unanswered = this.answers.filter(a => a === null).length;
    document.getElementById('unansweredCount').textContent = unanswered;
    document.getElementById('submitModal').classList.add('show');
  },

  closeModal() {
    document.getElementById('submitModal').classList.remove('show');
  },

  async submit(autoSubmitted = false) {
    this.closeModal();
    if (this.timerInterval) clearInterval(this.timerInterval);
    
    document.getElementById('simExam').classList.add('hidden');
    document.getElementById('simResults').classList.remove('hidden');
    
    window.scrollTo(0,0);
    
    if (autoSubmitted) {
      showToast('Tempo scaduto! Esame consegnato.', 'warning');
    } else {
      showToast('Esame consegnato con successo.', 'success');
    }

    // Calculate score
    let correct = 0;
    Progress.clearAttempts();
    
    this.questions.forEach((q, i) => {
      const isCorrect = this.answers[i] === q.correct_answer;
      if (isCorrect) correct++;
      Progress.recordAttempt(q.id, isCorrect);
    });
    
    const scorePct = Math.round((correct / this.questions.length) * 100);
    
    // Render result UI
    document.getElementById('simCorrect').textContent = correct;
    document.getElementById('simTotal').textContent = this.questions.length;
    
    // Animate arc
    setTimeout(() => {
      document.getElementById('simScoreArc').style.strokeDashoffset = 439.8 - (439.8 * scorePct / 100);
      let curr = 0;
      const interval = setInterval(() => {
        curr += 1;
        if (curr >= scorePct) {
          curr = scorePct;
          clearInterval(interval);
        }
        document.getElementById('simScoreValue').textContent = curr;
      }, 15);
    }, 100);

    const grade = document.getElementById('simGrade');
    const subtitle = document.getElementById('simResultSubtitle');
    const readText = document.getElementById('simReadinessText');
    const readFill = document.getElementById('simReadiness');
    const emoji = document.getElementById('simResultEmoji');
    
    readFill.style.width = `${scorePct}%`;
    
    if (scorePct >= 80) { 
      grade.textContent = 'Eccellente'; grade.className = 'grade-text excellent'; 
      subtitle.textContent = 'Ottimo lavoro! Sei pronto per il test reale.';
      readFill.style.background = 'var(--success)';
      readText.textContent = 'Alta probabilità di successo.';
      emoji.textContent = '🏆';
    }
    else if (scorePct >= 60) { 
      grade.textContent = 'Sufficiente'; grade.className = 'grade-text good';
      subtitle.textContent = 'Test superato, ma c\'è margine di miglioramento.';
      readFill.style.background = 'var(--primary)';
      readText.textContent = 'Preparazione adeguata. Ripassa le aree deboli.';
      emoji.textContent = '🌟';
    }
    else { 
      grade.textContent = 'Insufficiente'; grade.className = 'grade-text poor';
      subtitle.textContent = 'Non ci siamo ancora. Continua a studiare!';
      readFill.style.background = 'var(--error)';
      readText.textContent = 'Necessario ulteriore studio intensivo.';
      emoji.textContent = '📚';
    }

    // Submit to backend
    const res = await Progress.submitTestResult(
      'simulation', 'mixed', this.questions.length, correct, scorePct
    );
    
    if (res && res.weak_areas && res.weak_areas.length > 0) {
      document.getElementById('simWeakCard').style.display = 'block';
      const list = document.getElementById('simWeakList');
      list.innerHTML = '';
      res.weak_areas.forEach(a => {
        const item = document.createElement('div');
        item.className = 'weakness-item';
        item.innerHTML = `
          <div class="weakness-dot ${a.accuracy < 50 ? 'red' : 'orange'}"></div>
          <span style="font-weight:600;text-transform:capitalize;width:120px;">${a.category}</span>
          <div class="progress-bar" style="flex:1;"><div class="progress-fill ${a.accuracy < 50 ? 'progress-bar-accent' : 'progress-bar-warning'}" style="width:${a.accuracy}%"></div></div>
          <span style="font-weight:700;font-size:.875rem;min-width:40px;text-align:right;">${a.accuracy}%</span>
        `;
        list.appendChild(item);
      });
      document.getElementById('simWeakAdvice').innerHTML = `💡 Ti consigliamo di ripassare <strong>${res.weak_areas[0].category}</strong> utilizzando il <a href="/test?category=${res.weak_areas[0].category}">test mirato</a>.`;
    }
  }
};

// Wire up all simulation buttons — run immediately since script is at bottom of body
function initSimulation() {
  const startBtn = document.getElementById('startSimBtn');
  if (startBtn) startBtn.addEventListener('click', () => SimEngine.start());

  const prevBtn = document.getElementById('simPrevBtn');
  if (prevBtn) prevBtn.addEventListener('click', () => SimEngine.prev());

  const nextBtn = document.getElementById('simNextBtn');
  if (nextBtn) nextBtn.addEventListener('click', () => SimEngine.next());

  const flagBtn = document.getElementById('simFlagBtn');
  if (flagBtn) flagBtn.addEventListener('click', () => SimEngine.flag());

  const submitBtn = document.getElementById('simSubmitBtn');
  if (submitBtn) submitBtn.addEventListener('click', () => SimEngine.confirmSubmit());

  // Modal buttons (inline onclick still present in HTML)
  document.querySelectorAll('[onclick]').forEach(el => {
    const attr = el.getAttribute('onclick');
    if (attr && attr.includes('SimEngine')) {
      const fn = attr.replace(/SimEngine\.(\w+)\(\)/, '$1');
      if (SimEngine[fn]) {
        el.removeAttribute('onclick');
        el.addEventListener('click', () => SimEngine[fn]());
      }
    }
  });
}

// Scripts are at bottom of <body> so DOM is already parsed — run immediately
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSimulation);
} else {
  initSimulation();
}
