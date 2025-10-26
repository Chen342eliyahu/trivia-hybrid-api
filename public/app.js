// public/app.js

// קבועים
const API_BASE_URL = '/api'; // משתמשים בנתיב יחסי כי אנחנו באותו דומיין ופורט

// אלמנטים DOM
const loadQuizSection = document.getElementById('quiz-load-section');
const triviaScreen = document.getElementById('trivia-screen');
const resultsScreen = document.getElementById('results-screen');
const loadQuizButton = document.getElementById('load-quiz-button');
const quizIdInput = document.getElementById('quiz-id-input');
const loadStatus = document.getElementById('load-status');
const optionsContainer = document.getElementById('options-container');
const feedbackArea = document.getElementById('feedback-area');
const nextQuestionButton = document.getElementById('next-question-button');
const leaderboardList = document.getElementById('leaderboard-list');
const summaryList = document.getElementById('summary-list');
const playAgainButton = document.getElementById('play-again-button');

// משתני מצב מקומיים (הכרחיים ל-Frontend)
let currentQuestionData = null;
let currentQuestionIndex = 0;
let totalQuestions = 0;
let selectedAnswerIndex = null;
let gameStatus = 'initial';
let userId = 'web_user_1'; // ID משתמש קבוע לממשק הווב

// --- פונקציות עזר ל-API ---

async function sendApiRequest(endpoint, method = 'GET', data = null) {
    const url = API_BASE_URL + endpoint;
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, options);
        const result = await response.json();

        if (!response.ok) {
            console.error(`API Error on ${endpoint}:`, result);
            throw new Error(result.message || 'API call failed');
        }
        return result;

    } catch (error) {
        console.error(`Fetch Error to ${endpoint}:`, error);
        throw error;
    }
}

// --- לוגיקת משחק ---

/**
 * מציג את המסך המתאים בהתאם למצב המשחק
 */
function showScreen(screenId) {
    loadQuizSection.classList.add('hidden');
    triviaScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');

    if (screenId === 'loading' || screenId === 'initial') {
        loadQuizSection.classList.remove('hidden');
    } else if (screenId === 'trivia') {
        triviaScreen.classList.remove('hidden');
    } else if (screenId === 'results') {
        resultsScreen.classList.remove('hidden');
    }
}

/**
 * טוען שאלון חדש באמצעות API
 */
async function loadQuiz() {
    const quizId = quizIdInput.value.trim();
    if (!quizId) {
        loadStatus.textContent = '❌ אנא הזן ID שאלון.';
        return;
    }

    loadStatus.textContent = 'טוען שאלון...';
    loadQuizButton.disabled = true;

    try {
        const result = await sendApiRequest(`/quiz/load/${quizId}`, 'POST', {});
        
        loadStatus.textContent = `✅ השאלון "${result.quizId}" נטען בהצלחה! יש ${result.totalQuestions} שאלות.`;
        
        // טוען את השאלה הראשונה
        await loadCurrentQuestion();
        
    } catch (error) {
        loadStatus.textContent = `❌ שגיאה בטעינה: ${error.message}`;
        loadQuizButton.disabled = false;
    }
}

/**
 * טוען את נתוני השאלה הנוכחית מה-API ומציג אותה
 */
async function loadCurrentQuestion() {
    try {
        const statusResult = await sendApiRequest('/quiz/current');

        if (statusResult.status === 'finished') {
            displayResults();
            return;
        }

        currentQuestionData = statusResult.question;
        currentQuestionIndex = currentQuestionData.index - 1;
        totalQuestions = currentQuestionData.total;
        selectedAnswerIndex = null;
        feedbackArea.innerHTML = '';
        nextQuestionButton.classList.add('hidden');
        
        displayQuestion(currentQuestionData);
        showScreen('trivia');

    } catch (error) {
        alert(`שגיאה בשליפת השאלה: ${error.message}`);
        showScreen('initial');
    }
}

/**
 * מציג את השאלה על המסך
 */
function displayQuestion(question) {
    document.getElementById('question-header').textContent = `שאלה ${question.index}/${question.total}`;
    document.getElementById('question-text').textContent = question.question;

    optionsContainer.innerHTML = '';
    question.options.forEach((option, index) => {
        const button = document.createElement('button');
        button.textContent = option;
        button.dataset.index = index;
        button.onclick = () => handleAnswerSelect(index, button);
        optionsContainer.appendChild(button);
    });

    // מאפשר לחיצה על כפתורי התשובות
    optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = false);
}

/**
 * מטפל בלחיצה על אפשרות תשובה
 */
async function handleAnswerSelect(index, buttonElement) {
    if (selectedAnswerIndex !== null) return; // לא מאפשר מענה כפול

    selectedAnswerIndex = index;
    
    // סימון התשובה שנבחרה ונעילת הכפתורים
    buttonElement.classList.add('selected');
    optionsContainer.querySelectorAll('button').forEach(btn => btn.disabled = true);

    try {
        // --- שליחת התשובה ל-API ---
        const result = await sendApiRequest('/answer', 'POST', {
            userId: userId,
            questionIndex: currentQuestionIndex,
            selectedAnswerIndex: selectedAnswerIndex
        });

        // הצגת משוב
        if (result.isCorrect) {
            feedbackArea.className = 'feedback-correct';
            feedbackArea.textContent = `✅ נכון! הציון הנוכחי שלך: ${result.score}`;
            buttonElement.style.backgroundColor = '#d4edda'; // ירוק בהיר
        } else {
            feedbackArea.className = 'feedback-incorrect';
            feedbackArea.innerHTML = `❌ לא נכון. התשובה הנכונה היא: *${result.correct_answer_text}*. הציון הנוכחי שלך: ${result.score}`;
            buttonElement.style.backgroundColor = '#f8d7da'; // אדום בהיר
        }
        
        // הצגת כפתור "שאלה הבאה"
        nextQuestionButton.classList.remove('hidden');

    } catch (error) {
        // אם המשתמש כבר ענה על השאלה הנוכחית (ה-API מחזיר 400)
        if (error.message.includes('already answered')) {
            feedbackArea.className = 'feedback-incorrect';
            feedbackArea.textContent = 'כבר ענית על שאלה זו. לחץ "שאלה הבאה" כדי להמשיך.';
            nextQuestionButton.classList.remove('hidden');
            return;
        }

        feedbackArea.className = 'feedback-incorrect';
        feedbackArea.textContent = `שגיאה במענה: ${error.message}`;
    }
}

/**
 * מעבר לשאלה הבאה (מופעל על ידי כפתור)
 */
async function nextQuestion() {
    // מנקה משוב ומשתני מצב
    feedbackArea.innerHTML = '';
    nextQuestionButton.classList.add('hidden');
    selectedAnswerIndex = null;

    try {
        // --- שליחת בקשה ל-API למעבר לשאלה הבאה ---
        const result = await sendApiRequest('/quiz/next', 'POST', {});

        if (result.finished) {
            displayResults(result.leaderboard);
        } else {
            // טוען ומציג את השאלה החדשה
            await loadCurrentQuestion();
        }
    } catch (error) {
        alert(`שגיאה במעבר לשאלה הבאה: ${error.message}`);
    }
}

/**
 * הצגת מסך התוצאות הסופיות
 */
async function displayResults(leaderboard = null) {
    showScreen('results');
    
    // שליפת הסיכום המפורט והציון הסופי של המשתמש מה-API
    const resultsData = await sendApiRequest(`/results/${userId}`, 'GET');
    const finalScore = resultsData.currentScore;
    const totalQ = resultsData.totalQuestions;
    const percentage = totalQ > 0 ? Math.round((finalScore / totalQ) * 100) : 0;
    
    document.getElementById('final-score-text').textContent = `🎯 הציון הסופי שלך: ${finalScore}/${totalQ} (${percentage}%)`;

    // 1. טבלת מובילים
    if (leaderboard) {
        leaderboardList.innerHTML = '';
        leaderboard.forEach((player, index) => {
            const listItem = document.createElement('li');
            const icon = ['🥇', '🥈', '🥉'][index] || `${index + 1}.`;
            // הערה: בממשק הווב אין לנו את שם המשתמש, אלא רק את ה-ID
            listItem.textContent = `${icon} משתמש: ${player.userId} - ציון: ${player.currentGameScore}`;
            leaderboardList.appendChild(listItem);
        });
    }

    // 2. סיכום מפורט
    summaryList.innerHTML = '';
    resultsData.answers.forEach((answer, index) => {
        const item = document.createElement('div');
        const isCorrectClass = answer.isCorrect ? 'summary-correct' : 'summary-incorrect';
        const isCorrectText = answer.isCorrect ? '✅ נכון' : '❌ לא נכון';

        item.className = `summary-item ${isCorrectClass}`;
        item.innerHTML = `
            <strong>שאלה ${index + 1}:</strong> ${answer.questionText}<br>
            <strong>תשובתך:</strong> ${answer.selectedAnswer} (${isCorrectText})<br>
            <strong>תשובה נכונה:</strong> ${answer.correctAnswer}<br>
            <strong>הסבר:</strong> ${answer.explanation || 'אין הסבר.'}
            ${answer.moreInfoLink ? `<br><a href="${answer.moreInfoLink}" target="_blank">מידע נוסף</a>` : ''}
        `;
        summaryList.appendChild(item);
    });
}

// --- אתחול ואירועים ---

function attachEventListeners() {
    loadQuizButton.addEventListener('click', loadQuiz);
    nextQuestionButton.addEventListener('click', nextQuestion);
    playAgainButton.addEventListener('click', () => {
        showScreen('initial');
        loadStatus.textContent = '';
        loadQuizButton.disabled = false;
        // אפשר גם לאפס את הניקוד בשרת דרך API, אם כי loadQuiz מאתחל את המשחק
    });
}

function init() {
    attachEventListeners();
    showScreen('initial');
    // בדיקה ראשונית אם יש משחק פעיל
    // ניתן להוסיף כאן בדיקת GET /api/quiz/current ולעבור למסך trivia אם קיים
    // אבל נתחיל פשוט ממסך הטעינה כדי לא לכפות משחק קיים על המשתמש
}

// הפעלת האפליקציה
init();