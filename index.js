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

// חיבור הראוטר הנפרד
app.use('/api', apiRouter);

// טעינת Slack Client (מעבירים את slackApp)
require('./slackClient')(slackApp);

// הפעלת השרת
(async () => {
  await app.listen(PORT);
  console.log(`⚡️ Hybrid Trivia Server is running on port ${PORT}!`);
})();
