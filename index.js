// A. יבוא ספריות
require('dotenv').config(); 
const express = require('express');
const { App, ExpressReceiver } = require('@slack/bolt'); 
const sheetsLoader = require('./googleSheets'); 
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
// 1. ***חובה: קבצים סטטיים ראשונים***
app.use(express.static('public')); 

// 2. Body Parsers עבור ה-API
const apiRouter = express.Router();
apiRouter.use(express.json()); 
apiRouter.use(express.urlencoded({ extended: true }));


// E. חיבור ה-Slack Listener ל-Express
app.use(receiver.router); 


// F. *** חיבור ה-API לראוטר הנפרד לנתיב /api (לפני נתיב הבית) ***
app.use('/api', apiRouter); 


// G. נקודת קצה בסיסית (מגיש את index.html)
// *** חייב לבוא אחרי כל הראוטים האחרים ***
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});


// H. *** API לניהול חידונים (Routes) ***
// (שאר ה-API routes נשארים בתוך apiRouter כפי שהיו)
apiRouter.get('/status', (req, res) => { /* ... */ });
apiRouter.post('/quiz/load/:quizId', async (req, res) => { /* ... */ });
// ... (וכן הלאה, ודא שכל ה-API routes נמצאים כאן)

// ... (שאר הקוד של ייבוא Slack Client והפעלת השרת)