// --- הגדרות ראשוניות ---
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { App, ExpressReceiver } = require('@slack/bolt');
const sheetsLoader = require('./googleSheets');
const triviaLogic = require('./triviaLogic');

// --- אתחול Express ו-Slack Bolt ---
const app = express();

const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    endpoint: '/slack/events',
});

const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver,
    socketMode: false
});

const PORT = process.env.PORT || 3000;

// --- Static Files ---
app.use(express.static('public'));

// --- API Router נפרד ---
const apiRouter = express.Router();
apiRouter.use(bodyParser.json());
apiRouter.use(bodyParser.urlencoded({ extended: true }));

// --- ⚡ חיבור Slack Bolt לנתיב שלו ---
app.use('/slack/events', receiver.router);

// --- Routes רגילים ---
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

apiRouter.get('/status', (req, res) => {
    res.json({ status: 'API is operational', version: 'Hybrid 1.0', slack_connected: true });
});

apiRouter.post('/quiz/load/:quizId', async (req, res) => {
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

app.use('/api', apiRouter);

// --- Slack Commands ---
// /load-trivia-quiz-new
slackApp.command('/load-trivia-quiz-new', async ({ command, ack, respond }) => {
    await ack();
    const quizId = command.text.trim();
    if (!quizId) {
        return respond('Please provide a quiz ID. Usage: /load-trivia-quiz-new <quizId>');
    }
    try {
        const questions = await sheetsLoader.loadAndFilterQuestions(quizId);
        if (!questions.length) return respond(`No questions found for quiz ID: ${quizId}`);
        triviaLogic.initializeGame(quizId, questions);
        respond(`Quiz "${quizId}" loaded with ${questions.length} questions!`);
    } catch (error) {
        console.error(error);
        respond(`Error loading quiz: ${error.message}`);
    }
});

// /post-trivia-invite-new
slackApp.command('/post-trivia-invite-new', async ({ command, ack, respond, client }) => {
    await ack();
    try {
        await client.chat.postMessage({
            channel: command.channel_id,
            text: `Trivia game invite posted! Use /load-trivia-quiz-new to start a quiz.`
        });
        respond('Invite posted successfully.');
    } catch (error) {
        console.error(error);
        respond(`Error posting invite: ${error.message}`);
    }
});

// --- Slack Actions (Buttons etc) ---
slackApp.action(/.*/, async ({ body, ack, respond }) => {
    await ack();
    respond(`You clicked a button or triggered an action!`);
});

// --- הפעלת השרת ---
(async () => {
    await app.listen(PORT);
    console.log(`⚡️ Hybrid Trivia Server is running on port ${PORT}!`);
})();
