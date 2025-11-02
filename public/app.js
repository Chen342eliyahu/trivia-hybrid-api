// public/app.js

// קבועים
const API_BASE_URL = '/api'; 
const userId = `web_user_${Math.random().toString(36).substring(2, 9)}`; 

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
const adminTools = document.getElementById('admin-tools'); // אלמנט המנהל הראשי
const adminTitle = document.getElementById('admin-title'); 

// משתני מצב מקומיים
let currentQuestionData = null;
let currentQuestionIndex = 0;
let totalQuestions = 0;
let selectedAnswerIndex = null;
let gameStatus = 'initial';

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

    if (screenId === 'initial') {
        loadQuizSection.classList.remove('hidden');
    } else if (screenId === 'trivia') {
        triviaScreen.classList.remove('hidden');
    } else if (screenId === 'results') {
        resultsScreen.classList.remove('hidden');
    }
}

/**
 * טוען שאלון חדש (Admin) באמצעות שליחת JSON ל-API החדש
 */
async function loadQuiz(quizIdOverride = null) {
    const quizId = quizIdOverride || quizIdInput.value.trim();
    const quizDataString = document.getElementById('quiz-data-input').value;

    if (!quizId || !quizDataString) {
        loadStatus.textContent = '❌ חסרים מזהה שאלון או נתונים.';
        return;
    }

    try {
        const questions = JSON.parse(quizDataString);

        if (!Array.isArray(questions) || questions.length === 0) {
            loadStatus.textContent = '❌ נתוני ה-JSON אינם מערך תקין או שהם ריקים.';
            return;
        }

        loadStatus.textContent = `טוען שאלון ID ${quizId} (מ-JSON)...`;
        loadQuizButton.disabled = true;

        // 💡 שליחה ל-Endpoint החדש: /api/admin/load-quiz-data
        const result = await sendApiRequest(`/admin/load-quiz-data`, 'POST', {
            quizId: quizId,
            questions: questions
        });
        
        loadStatus.textContent = `✅ השאלון "${result.quizId}" נטען בהצלחה! יש ${result.totalQuestions} שאלות.`;
        
        // טוען את השאלה הראשונה
        await loadCurrentQuestion();
        
    } catch (error) {
        loadStatus.textContent = `❌ שגיאה בטעינה: ודא פורמט JSON תקין. שגיאה: ${error.message}`;
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
            displayResults(statusResult.leaderboard);
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
        // אם שגיאה 404 (No active quiz found) או שגיאת FETCH
        showScreen('initial');
        adminTitle.textContent = "אין חידון פעיל";
        loadStatus.textContent = "אנא המתן לטעינת שאלון חדש על ידי המנהל.";
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
    loadQuizButton.addEventListener('click', () => loadQuiz());
    nextQuestionButton.addEventListener('click', nextQuestion);
    playAgainButton.addEventListener('click', () => {
        showScreen('initial');
        loadStatus.textContent = '';
        loadQuizButton.disabled = false;
        // אפשרות לאפס את הניקוד באמצעות קריאת API עתידית
    });
}


/**
 * 💡 התיקון: לוגיקת אתחול שמפצלת בין מנהל למשתמש רגיל
 */
function init() {
    attachEventListeners();
    
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminMode = urlParams.has('admin'); // פרמטר מנהל: ?admin=true

    if (isAdminMode) {
        // *** מצב מנהל: חשיפת ממשק הניהול ***
        showScreen('initial'); 
        adminTools.classList.remove('hidden'); // חשיפת כלי המנהל
        adminTitle.textContent = "🔒 ממשק ניהול שאלונים";
        loadStatus.textContent = "מנהל: הדבק JSON ולחץ 'טען שאלון'.";
        
        const quizIdFromUrl = urlParams.get('id');
        if (quizIdFromUrl) {
             // אם ID קיים ב-URL (לדוגמה: ?admin=true&id=1), ממלאים את השדה
             quizIdInput.value = quizIdFromUrl;
             loadStatus.textContent = `מנהל: מוכן לטעון ID ${quizIdFromUrl}. הדבק JSON.`;
        }
        
    }
    
    // *** משתמש רגיל / סוף אתחול המנהל ***
    loadCurrentQuestion();
}

// הפעלת האפליקציה
init();