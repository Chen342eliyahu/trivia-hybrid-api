const NodeCache = require('node-cache');
const gameCache = new NodeCache({ stdTTL: 7200, checkperiod: 120 }); // שמירה לשעתיים (כמו איפוס שרת)
const ACTIVE_GAME_KEY = 'active_game'; 

function getCorrectAnswerText(question) {
    if (question.CorrectAnswerIndex !== undefined && 
        question.CorrectAnswerIndex >= 0 && 
        question.CorrectAnswerIndex < question.options.length) {
        return question.options[question.CorrectAnswerIndex];
    }
    return 'N/A';
}

/** 1. אתחול משחק חדש */
function initializeGame(quizId, questions) {
    const gameData = {
        quizId: quizId,
        questions: questions,
        currentQuestionIndex: 0,
        userScores: {}, 
        status: 'active',
        totalQuestions: questions.length
    };
    gameCache.set(ACTIVE_GAME_KEY, gameData);
    return gameData;
}

/** 2. שליפת נתוני המשחק הנוכחי */
function getActiveGame() {
    return gameCache.get(ACTIVE_GAME_KEY);
}

/** 3. שליפת השאלה הנוכחית */
function getCurrentQuestion() {
    const game = getActiveGame();
    if (game && game.status === 'active') {
        return game.questions[game.currentQuestionIndex];
    }
    return undefined;
}


/** 4. שליחת תשובה ממשתמש */
function submitAnswer(userId, questionIndex, selectedAnswerIndex) {
    const game = getActiveGame();
    if (!game || game.status !== 'active') {
        return { success: false, message: 'No active quiz is running.' };
    }

    const question = game.questions[questionIndex];
    if (!question || questionIndex !== game.currentQuestionIndex) {
        return { success: false, message: 'Question index mismatch or question not found. Try starting a new quiz.' };
    }

    const isCorrect = selectedAnswerIndex === question.CorrectAnswerIndex;
    
    if (!game.userScores[userId]) {
        game.userScores[userId] = { currentGameScore: 0, currentAnswers: [] };
    }
    
    const user = game.userScores[userId];

    const alreadyAnswered = user.currentAnswers.some(a => a.questionIndex === questionIndex);
    if (alreadyAnswered) {
         return { success: false, message: 'You have already answered this question.', isCorrect: isCorrect, score: user.currentGameScore };
    }

    if (isCorrect) {
        user.currentGameScore++;
    }

    user.currentAnswers.push({
        questionIndex: questionIndex,
        questionText: question.Question,
        selectedAnswer: question.options[selectedAnswerIndex],
        correctAnswer: getCorrectAnswerText(question),
        isCorrect: isCorrect,
        explanation: question.Explanation,
        moreInfoLink: question.MoreInfoLink || null
    });
    
    gameCache.set(ACTIVE_GAME_KEY, game);
    
    return { 
        success: true, 
        isCorrect: isCorrect, 
        score: user.currentGameScore,
        correct_answer_text: getCorrectAnswerText(question),
        explanation: question.Explanation
    };
}


/** 5. מעבר לשאלה הבאה */
function nextQuestion() {
    const game = getActiveGame();
    if (!game || game.status !== 'active') return { finished: true };

    const nextIndex = game.currentQuestionIndex + 1;
    
    if (nextIndex < game.questions.length) {
        game.currentQuestionIndex = nextIndex;
        gameCache.set(ACTIVE_GAME_KEY, game);
        return { finished: false, question: game.questions[nextIndex] };
    } else {
        game.status = 'finished';
        gameCache.set(ACTIVE_GAME_KEY, game);
        return { finished: true, leaderboard: getLeaderboard(game.userScores) };
    }
}


/** 6. הפיכת נתוני הציונים לטבלת מובילים מסודרת */
function getLeaderboard(userScores) {
    const leaderboard = Object.keys(userScores).map(userId => ({
        userId: userId,
        currentGameScore: userScores[userId].currentGameScore
    }));
    leaderboard.sort((a, b) => b.currentGameScore - a.currentGameScore); 
    return leaderboard;
}

/** 7. שליפת נתוני התשובות של משתמש ספציפי */
function getUserAnswers(userId) {
    const game = getActiveGame();
    if (!game || !game.userScores[userId]) return undefined;
    return game.userScores[userId].currentAnswers;
}

module.exports = {
    initializeGame,
    getActiveGame,
    getCurrentQuestion,
    submitAnswer,
    nextQuestion,
    getLeaderboard,
    getUserAnswers,
    getCorrectAnswerText
};