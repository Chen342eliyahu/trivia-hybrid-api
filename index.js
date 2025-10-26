// A. יבוא ספריות
require('dotenv').config(); 
const express = require('express');
const { App, ExpressReceiver } = require('@slack/bolt'); 
const sheetsLoader = require('./googleSheets'); 
const triviaLogic = require('./triviaLogic');   


// B. הגדרת Express ו-Bolt

// 1. אתחול מופע Express
const app = express();

// 2. הגדרת ExpressReceiver (מקבל) מפורש ל-Slack
const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoint: '/slack/events', 
});

// 3. יצירת ה-Bolt App וחיבור ל-Receiver
const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver: receiver, 
    socketMode: false 
});

// C. פורט (Port) שבו השרת יאזין
const PORT = process.env.PORT || 3000;

// D. הגדרות Middleware:
app.use(express.static('public')); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// E. חיבור ה-Slack Listener ל-Express
app.use(receiver.router); 

// F. נקודת קצה בסיסית (מגיש את index.html)
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// G. נקודת קצה לבדיקת סטטוס ה-API
app.get('/api/status', (req, res) => {
    res.json({ status: 'API is operational', version: 'Hybrid 1.0', slack_connected: true });
});


// H. *** API Endpoints for Quiz Management ***

// POST /api/quiz/load/:quizId
app.post('/api/quiz/load/:quizId', async (req, res) => {
    const quizId = req.params.quizId;
    try {
        const questions = await sheetsLoader.loadAndFilterQuestions(quizId); 
        
        if (questions.length === 0) {
            return res.status(404).json({ message: 'Quiz not found or empty.' });
        }

        const game = triviaLogic.initializeGame(quizId, questions);
        res.status(200).json({ 
            message: `Quiz "${quizId}" loaded successfully with ${questions.length} questions.`,
            quizId: quizId,
            totalQuestions: game.totalQuestions
        });

    } catch (error) {
        console.error("Error loading quiz:", error.message);
        res.status(500).json({ message: 'Failed to load quiz data.', error: error.message });
    }
});

// GET /api/quiz/current
app.get('/api/quiz/current', (req, res) => {
    const game = triviaLogic.getActiveGame();
    if (!game || game.status === 'finished') {
        const leaderboard = game ? triviaLogic.getLeaderboard(game.userScores) : [];
        return res.json({ status: 'finished', leaderboard: leaderboard });
    }

    const question = triviaLogic.getCurrentQuestion();
    if (!question) {
         return res.status(404).json({ status: 'error', message: 'No active question found.' });
    }

    res.json({
        status: game.status,
        question: {
            question: question.Question,
            options: question.options,
            index: game.currentQuestionIndex + 1,
            total: game.totalQuestions
        }
    });
});

// POST /api/answer
app.post('/api/answer', (req, res) => {
    const { userId, questionIndex, selectedAnswerIndex } = req.body;
    
    if (!userId || questionIndex === undefined || selectedAnswerIndex === undefined) {
        return res.status(400).json({ message: 'Missing user ID, question index, or selected answer index.' });
    }

    const result = triviaLogic.submitAnswer(userId, questionIndex, selectedAnswerIndex);
    
    if (!result.success) {
        return res.status(400).json({ message: result.message, isCorrect: result.isCorrect, score: result.score });
    }

    res.json({
        success: true,
        isCorrect: result.isCorrect,
        score: result.score,
        correct_answer_text: result.correct_answer_text,
        explanation: result.explanation
    });
});

// POST /api/quiz/next
app.post('/api/quiz/next', (req, res) => {
    const next = triviaLogic.nextQuestion();
    
    if (next.finished) {
        return res.json({ finished: true, leaderboard: next.leaderboard });
    }
    
    const game = triviaLogic.getActiveGame();
    res.json({ 
        finished: false,
        question: {
            question: next.question.Question,
            options: next.question.options,
            index: game.currentQuestionIndex + 1,
            total: game.totalQuestions
        }
    });
});

// GET /api/results/:userId
app.get('/api/results/:userId', (req, res) => {
    const userId = req.params.userId;
    const answers = triviaLogic.getUserAnswers(userId);
    const game = triviaLogic.getActiveGame();

    if (!game || !answers) {
        return res.status(404).json({ message: 'No current game or user data found.' });
    }

    res.json({
        userId: userId,
        quizId: game.quizId,
        totalQuestions: game.totalQuestions,
        currentScore: game.userScores[userId] ? game.userScores[userId].currentGameScore : 0,
        answers: answers
    });
});


// H2. *** ייבוא והפעלת קוד ה-Slack Client המחובר ל-API ***
// 💡 המשתנה slackApp מועבר כארגומנט לפונקציה ב-slackClient.js
require('./slackClient')(slackApp); 


// I. אתחול השרת
(async () => {
    // נתחיל להאזין לבקשות
    await app.listen(PORT);
    console.log(`⚡️ Hybrid Trivia Server is running on port ${PORT}!`);
})();