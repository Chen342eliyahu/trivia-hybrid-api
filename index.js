// A. יבוא ספריות
require('dotenv').config(); 
const express = require('express');
const { App, ExpressReceiver } = require('@slack/bolt'); 
// 🚨 הוסר: const sheetsLoader = require('./googleSheets'); 
const triviaLogic = require('./triviaLogic');   

// B. הגדרת Express ו-Bolt
const app = express();

const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoint: '/slack/events', 
});

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

// 2. API Body Parsers (מוגדרים רק ב-apiRouter)
const apiRouter = express.Router();
apiRouter.use(express.json()); 
apiRouter.use(express.urlencoded({ extended: true }));


// E. חיבור ה-Slack Listener ל-Express
app.use(receiver.router); 


// F. חיבור ה-API לראוטר הנפרד לנתיב /api
app.use('/api', apiRouter); 


// G. נקודת קצה בסיסית (מגיש את index.html)
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});


// H. *** API לניהול חידונים (Routes) ***

// H.1. סטטוס בריאות
apiRouter.get('/status', (req, res) => {
    res.json({ status: 'API is operational', version: 'Hybrid 1.0', slack_connected: true });
});

// H.2. POST /api/admin/load-quiz-data - 💡 ה-Endpoint החדש של המנהל (מטעין JSON)
apiRouter.post('/admin/load-quiz-data', (req, res) => {
    const { quizId, questions } = req.body; 

    if (!quizId || !questions || questions.length === 0) {
        return res.status(400).json({ message: 'Missing quizId or questions data.' });
    }

    try {
        // מטעין את השאלות החדשות לזיכרון (NodeCache)
        const game = triviaLogic.initializeGame(quizId, questions);
        res.status(200).json({
            message: `New quiz "${quizId}" loaded successfully.`,
            quizId: quizId,
            totalQuestions: game.totalQuestions
        });
    } catch (error) {
        console.error("Error initializing game:", error.message);
        res.status(500).json({ message: 'Failed to initialize quiz logic.' });
    }
});


// H.3. GET /api/quiz/current - שליפת שאלה נוכחית
apiRouter.get('/quiz/current', (req, res) => {
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

// H.4. POST /api/answer - שליחת תשובה
apiRouter.post('/answer', (req, res) => {
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

// H.5. POST /api/quiz/next - מעבר לשאלה הבאה
apiRouter.post('/quiz/next', (req, res) => {
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

// H.6. GET /api/results/:userId - שליפת תוצאות משתמש
apiRouter.get('/results/:userId', (req, res) => {
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


// I. *** ייבוא והפעלת קוד ה-Slack Client המחובר ל-API ***
require('./slackClient')(slackApp); 


// J. אתחול השרת
(async () => {
    await app.listen(PORT);
    console.log(`⚡️ Hybrid Trivia Server is running on port ${PORT}!`);
})();