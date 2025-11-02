// slackClient.js

// 💡 אין require('node-fetch') מכיוון שאנו סומכים על fetch הגלובלי ב-Node.js v22.x ומעלה.

module.exports = (slackApp) => {

    // הגדרת ה-URL הבסיסי: השרת מתחבר לעצמו דרך localhost:PORT
    const RENDER_INTERNAL_URL = process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:3000';
    const API_BASE_URL = `${RENDER_INTERNAL_URL}/api`;

    // --- פונקציות עזר לשליחת בקשות HTTP (fetch) ל-API שלנו ---
    async function sendApiRequest(endpoint, data = {}, method = 'POST') {
        const url = API_BASE_URL + endpoint;
        
        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'POST' ? JSON.stringify(data) : undefined
            });
            const result = await response.json();

            if (!response.ok) {
                console.error(`API Error on ${url}:`, result);
                throw new Error(result.message || response.statusText || `API call failed with status: ${response.status}`);
            }
            return result;
        } catch (error) {
            console.error(`FETCH ERROR (Internal) to ${url}:`, error);
            throw new Error(`Failed to communicate with API: ${error.message}`);
        }
    }

    // ----------------------------------------------------------------------
    // 1️⃣ פקודה: /post-trivia-invite (הפעלת הטריוויה - מחליף את פקודת הטעינה הישנה)
    // ----------------------------------------------------------------------
    slackApp.command('/post-trivia-invite', async ({ command, ack, client, respond }) => {
        await ack(); // *** ACK מיידי חובה! (מונע operation_timeout) ***

        (async () => {
            try {
                // 1. בדיקת מצב המשחק הנוכחי דרך ה-API
                const statusData = await sendApiRequest('/quiz/current', {}, 'GET');
                
                let responseText, responseBlocks;
                
                if (statusData.status === 'finished' || statusData.message === 'No active quiz found.') {
                     responseText = "❌ אין חידון פעיל כרגע. אנא בקש מהמנהל לטעון שאלון חדש דרך ה-Web Admin.";
                     responseBlocks = null;
                } else {
                     const totalQuestions = statusData.question.total;
                     responseText = "🧠 אתגר הטריוויה השבועי מוכן! 🎯";
                     responseBlocks = [
                         {
                             type: "section",
                             text: { type: "mrkdwn", text: `*🧠 אתגר הטריוויה השבועי! 🎯*\n\nמוכנים לבדוק את הידע שלכם?\nבחידון זה יש ${totalQuestions} שאלות.` }
                         },
                         {
                             type: "actions",
                             elements: [
                                 {
                                     type: "button",
                                     text: { type: "plain_text", text: "🚀 התחל טריוויה" },
                                     style: "primary",
                                     action_id: "start_trivia_action" // Action ID חדש
                                 }
                             ]
                         }
                     ];
                }

                // 2. משתמשים ב-respond() כדי לשלוח את ההודעה לאחר ה-ACK
                await respond({
                    text: responseText,
                    blocks: responseBlocks,
                    response_type: 'in_channel'
                });

            } catch (error) {
                await respond({
                    text: `❌ שגיאה פנימית בשליפת סטטוס הטריוויה. ודא שהשרת (Render) פעיל: ${error.message}`,
                    response_type: 'ephemeral' 
                });
            }
        })();
    });

    // ----------------------------------------------------------------------
    // 2️⃣ טיפול בלחיצה על כפתור "Start Trivia" (פותח מודאל)
    // ----------------------------------------------------------------------
    slackApp.action('start_trivia_action', async ({ ack, body, client }) => {
        await ack(); // *** ACK מיידי חובה! ***

        const userId = body.user.id;
        const triggerId = body.trigger_id;

        try {
            // 1. שליפת מצב המשחק הנוכחי
            const statusData = await sendApiRequest('/quiz/current', {}, 'GET');
            
            if (statusData.status === 'finished' || statusData.message === 'No active quiz found.') {
                 return client.chat.postEphemeral({
                    channel: body.channel.id,
                    user: userId,
                    text: "❌ אין חידון פעיל כרגע. המתן לטעינה על ידי המנהל.",
                });
            }

            const question = statusData.question;
            const currentQuizId = statusData.quizId || 'N/A';
            
            // 2. יצירת המודאל ופתיחתו
            await showQuestion(client, triggerId, userId, question, currentQuizId, question.total, false);

        } catch (error) {
            console.error("Error opening trivia modal:", error);
            await client.chat.postEphemeral({
                channel: body.channel.id,
                user: userId,
                text: `❌ שגיאה קריטית בטעינת המודאל: ${error.message}`,
            });
        }
    });

    // ----------------------------------------------------------------------
    // 3️⃣ טיפול בבחירת תשובה (action)
    // ----------------------------------------------------------------------
    slackApp.action(/answer_q_/, async ({ body, ack, client, action }) => {
        await ack(); // *** ACK מיידי חובה! ***

        const userId = body.user.id;
        // action.value מכיל את index השאלה ואת index התשובה (לדוגמה: "2:1")
        const [questionIndex, selectedAnswerIndex] = action.value.split(':').map(Number);
        const viewId = body.view.id; 

        try {
            // 1. שליחת התשובה ל-API
            await sendApiRequest('/answer', 'POST', {
                userId: userId,
                questionIndex: questionIndex - 1, // צריך אינדקס 0-based
                selectedAnswerIndex: selectedAnswerIndex
            });
        
            // 2. מעבר לשאלה הבאה
            const nextQuestionResult = await sendApiRequest('/quiz/next');

            if (nextQuestionResult.finished) {
                await showGameResults(client, viewId, userId, nextQuestionResult.leaderboard);
                return;
            }
            
            // 3. עדכון המודאל לשאלה הבאה
            const nextQ = nextQuestionResult.question;
            await showQuestion(client, viewId, userId, nextQ, nextQ.quizId || 'N/A', nextQ.total, true);

        } catch (error) {
            // טיפול בשגיאות כגון "כבר ענית" או "שגיאת API"
            if (error.message.includes('already answered')) {
                 await client.chat.postEphemeral({ channel: body.channel.id, user: userId, text: "כבר ענית על שאלה זו. המודאל מתעדכן." });
            } else {
                 await client.chat.postEphemeral({ channel: body.channel.id, user: userId, text: `❌ שגיאה במענה: ${error.message}` });
            }
        }
    });

    // ----------------------------------------------------------------------
    // 4️⃣ פונקציות תצוגה (showQuestion, showGameResults)
    // ----------------------------------------------------------------------

    async function showQuestion(client, triggerOrViewId, userId, question, quizId, totalQuestions, isUpdate = false) {
        // ... (הקוד ליצירת מודאל השאלה, משתמש ב-sendApiRequest לציון נוכחי)
        const questionIndex = question.index;

        const scoreData = await sendApiRequest(`/results/${userId}`, {}, 'GET');
        const currentScore = scoreData.currentScore || 0;
        const answeredCount = scoreData.answers ? scoreData.answers.length : 0;
        
        const questionBlocks = question.options.map((option, index) => ({
            type: "actions",
            elements: [{
                type: "button",
                text: { type: "plain_text", text: `בחר: ${option}` },
                value: `${questionIndex}:${index}`, // index השאלה: index התשובה
                action_id: `answer_q_${questionIndex}` // ID קבוע
            }]
        }));

        const viewBlocks = [
            { type: "section", text: { type: "mrkdwn", text: `*שאלה ${questionIndex}/${totalQuestions}*\n\n*${question.question}*` } },
            ...questionBlocks, 
            { type: "context", elements: [ { type: "mrkdwn", text: `ציון נוכחי: ${currentScore}/${answeredCount}` } ] }
        ];

        const viewPayload = {
            type: "modal",
            callback_id: "trivia_modal_view",
            title: { type: "plain_text", text: `Quiz ID: ${quizId}` },
            blocks: viewBlocks
        };

        try {
            if (isUpdate) {
                await client.views.update({ view_id: triggerOrViewId, view: viewPayload });
            } else {
                await client.views.open({ trigger_id: triggerOrViewId, view: viewPayload });
            }
        } catch (error) {
            console.error('Error showing question:', error);
        }
    }

    async function showGameResults(client, viewId, userId, gameLeaderboard) {
        // ... (הקוד ליצירת מודאל התוצאות, משתמש ב-sendApiRequest לסיכום מפורט)
        const resultsData = await sendApiRequest(`/results/${userId}`, {}, 'GET');

        const finalScore = resultsData.currentScore;
        const totalQuestions = resultsData.totalQuestions; 
        const answers = resultsData.answers;
        const percentage = totalQuestions > 0 ? Math.round((finalScore / totalQuestions) * 100) : 0;
        
        let performanceMessage = percentage >= 80 ? "🌟 עבודה מצוינת!" : "💪 המשיכו להתאמן!";

        const leaderboardBlocks = [
            { type: "section", text: { type: "mrkdwn", text: "*🏅 טבלת מובילים!*" } },
            { type: "divider" }
        ];

        // מציג 3 מובילים
        gameLeaderboard.slice(0, 3).forEach((player, index) => {
            leaderboardBlocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${['🥇', '🥈', '🥉'][index] || `${index + 1}.`} <@${player.userId}>*\nציו: *${player.currentGameScore}*`
                }
            });
        });
        leaderboardBlocks.push({ type: "divider" });

        // סיכום מפורט
        const summaryBlocks = [];
        answers.forEach((answer, index) => {
            const isCorrectText = answer.isCorrect ? '✅ נכון' : '❌ לא נכון';
            summaryBlocks.push({
                type: "section",
                text: { type: "mrkdwn", text: `*שאלה ${index + 1}:* ${answer.questionText}\n` +
                        `*תשובתך:* ${answer.selectedAnswer} (${isCorrectText})\n` +
                        `*תשובה נכונה:* ${answer.correctAnswer}` 
                }
            });
        });

        try {
            await client.views.update({
                view_id: viewId,
                view: {
                    type: "modal",
                    callback_id: "trivia_results",
                    title: { type: "plain_text", text: `תוצאות הטריוויה 🏆` },
                    blocks: [
                        ...leaderboardBlocks,
                        { type: "section", text: { type: "mrkdwn", text: `*🎯 הציון שלך: ${finalScore}/${totalQuestions} (${percentage}%)*\n\n${performanceMessage}` } },
                        { type: "divider" },
                        { type: "section", text: { type: "mrkdwn", text: `*סיכום מפורט:*` } },
                        ...summaryBlocks,
                    ]
                }
            });
        } catch (error) {
            console.error('Error showing results:', error);
        }
    }

    // ----------------------------------------------------------------------
    // 5️⃣ מטפל שגיאות כללי
    // ----------------------------------------------------------------------
    slackApp.error((error) => {
        console.error('Slack app error:', error);
    });
};