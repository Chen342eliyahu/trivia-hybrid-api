// public/app.js

// ... (שאר הקוד עד הפונקציה loadQuiz)

/**
 * טוען שאלון חדש באמצעות API
 * 💡 מתווסף פרמטר אופציונלי לאימות מנהל
 */
async function loadQuiz(quizIdOverride = null) {
    const quizId = quizIdOverride || quizIdInput.value.trim();
    
    if (!quizId) {
        loadStatus.textContent = '❌ אנא הזן ID שאלון.';
        return;
    }

    loadStatus.textContent = `טוען שאלון ID ${quizId}...`;
    loadQuizButton.disabled = true;

    try {
        // ה-API מצפה לבקשת POST לנתיב /api/quiz/load/[ID]
        const result = await sendApiRequest(`/quiz/load/${quizId}`, 'POST', {});
        
        loadStatus.textContent = `✅ השאלון "${result.quizId}" נטען בהצלחה! יש ${result.totalQuestions} שאלות.`;
        
        // טוען את השאלה הראשונה
        await loadCurrentQuestion();
        
    } catch (error) {
        // שגיאת ה-JSON נפתרה בשרת, עכשיו מטפלים בשגיאת טעינה אמיתית
        loadStatus.textContent = `❌ שגיאה בטעינה: ${error.message}`;
        loadQuizButton.disabled = false;
    }
}

// ... (שאר הקוד)

// --- אתחול ואירועים ---

function attachEventListeners() {
    loadQuizButton.addEventListener('click', () => loadQuiz());
    nextQuestionButton.addEventListener('click', nextQuestion);
    playAgainButton.addEventListener('click', () => {
        showScreen('initial');
        loadStatus.textContent = '';
        loadQuizButton.disabled = false;
    });
}


/**
 * 💡 התיקון: לוגיקת אתחול שמפצלת בין מנהל למשתמש רגיל
 */
function init() {
    attachEventListeners();
    
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminMode = urlParams.has('admin'); 
    const quizIdFromUrl = urlParams.get('id'); // פרמטר לטעינה מיידית: ?admin=true&id=1

    if (isAdminMode) {
        // *** מצב מנהל ***
        showScreen('initial'); // מציג את אזור הטעינה
        
        // חושף את הכלים הניהוליים
        quizIdInput.classList.remove('hidden'); 
        loadQuizButton.classList.remove('hidden'); 
        
        loadStatus.textContent = "מנהל: הזן ID שאלון ולחץ 'טען שאלון'.";

        if (quizIdFromUrl) {
             // אם ID קיים ב-URL, טוענים אוטומטית
             quizIdInput.value = quizIdFromUrl;
             loadQuiz(quizIdFromUrl); // מפעילים טעינה אוטומטית
             return; // עוצרים את ה-init
        }
    }
    
    // *** משתמש רגיל / סוף אתחול המנהל ***
    loadCurrentQuestion();
}

// הפעלת האפליקציה
init();