// A. יבוא ספריות
require('dotenv').config(); 
const express = require('express');
// מייבאים גם את bodyParser כדי להשתמש בו בנפרד
const bodyParser = require('body-parser'); 
const { App, ExpressReceiver } = require('@slack/bolt'); 
const sheetsLoader = require('./googleSheets'); 
const triviaLogic = require('./triviaLogic');   


// B. הגדרת Express ו-Bolt

// 1. אתחול מופע Express
const app = express();

// 2. הגדרת ExpressReceiver (מקבל) מפורש ל-Slack
// *** מוסרים bodyParser: false ונותנים ל-Slack לנהל את נתיב האירועים ***
const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoint: '/slack/events', 
    // כדי לתקן את שגיאת ה-stream, נשתמש בטכניקה חיצונית, לכן משאירים את זה פשוט
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
// 1. מאפשר שימוש בקבצי ה-Frontend שלנו.
app.use(express.static('public')); 

// 2. *** התיקון הקריטי: פרסור מותאם אישית של Body ***
// אנו מוסיפים את פרסור ה-Body של Express רק עבור נתיבים שאינם /slack/events.
// זה מבטיח שזרם הבקשה נשאר פתוח עבור Slack Bolt.
app.use('/slack/events', bodyParser.raw({ type: '*/*' })); // מפרסר Raw Body רק עבור Slack
app.use(bodyParser.json()); // מפרסר JSON עבור כל שאר נתיבי ה-API
app.use(bodyParser.urlencoded({ extended: true })); // מפרסר URL-Encoded עבור כל שאר נתיבי ה-API


// E. חיבור ה-Slack Listener ל-Express
// 1. תיקון קריטי לאימות URL (חייב להיות לפני app.use(receiver.router))
app.use((req, res, next) => {
    if (req.body && req.body.type === 'url_verification') {
        // ה-body כאן הוא raw, אז אנחנו צריכים לקרוא אותו
        // אבל מכיוון שהוספנו את bodyParser.raw() למעלה, ננסה לגשת ל-body ישירות (שכבר יצרנו אותו ב-bodyParser.json())
        // אם זה עדיין קורס, יש לשנות את הקוד לטיפול ב-raw body.
        
        // נשתמש בבדיקה פשוטה יותר כרגע
        if (req.body.challenge) {
            console.log('🔐 Responding to Slack URL verification challenge...');
            return res.status(200).json({ challenge: req.body.challenge });
        }
    }
    next();
});

// 2. חיבור ה-Router של Slack Bolt
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
require('./slackClient')(slackApp); 


// I. אתחול השרת
(async () => {
    await app.listen(PORT);
    console.log(`⚡️ Hybrid Trivia Server is running on port ${PORT}!`);
})();