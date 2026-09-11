/**
 * progress.js — Handles local caching and API calls for progress
 */

const Progress = {
  // Temporary local queue for question attempts to batch send if needed,
  // but for now we just send via API when a test completes.
  // For the day practice, we can record them instantly or keep them local until day complete.
  
  attempts: [],

  recordAttempt(questionId, wasCorrect) {
    this.attempts.push({ id: questionId, was_correct: wasCorrect });
  },

  clearAttempts() {
    this.attempts = [];
  },

  getAttempts() {
    return this.attempts;
  },

  async submitTestResult(category, difficulty, total, correct, scorePct) {
    const payload = {
      category: category,
      difficulty: difficulty,
      total_questions: total,
      correct_answers: correct,
      score_percent: scorePct,
      question_log: this.attempts
    };

    try {
      const res = await fetch('/api/submit-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      this.clearAttempts();
      return data;
    } catch (e) {
      console.error('Failed to submit test result', e);
      return null;
    }
  }
};
