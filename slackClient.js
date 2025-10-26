// slackClient.js
// חובה לוודא ש-node-fetch מותקן: npm install node-fetch
const fetch = require('node-fetch'); 

module.exports = (slackApp) => {

    // --- פונקציית עזר כללית ---
    async function sendApiRequest(endpoint, data = {}, method = 'POST') {
        // שימוש ב-URL יחסי כדי לאפשר שימוש ב-localhost או ב-Render URL
        const baseUrl = process.env.API_EXTERNAL_URL || 'http://localhost:3000/api'; 
        const url = `${baseUrl}${endpoint}`;

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'POST' ? JSON.stringify(data) : undefined
            });
            const result = await response.json();

            if (!response.ok) {
                console.error(`API Error on ${endpoint}:`, result);
                throw new Error(result.message || response.statusText || `API call failed with status: ${response.status}`);
            }
            return result;
        } catch (error) {
            console.error('FETCH ERROR:', error);
            // אם ה-fetch נכשל, נשליך שגיאה ברורה
            throw new Error(`Failed to communicate with API: ${error.message}`);
        }
    }

    // ----------------------------------------------------------------------
    // 1️⃣ פקודה: /load-trivia-quiz
    // ----------------------------------------------------------------------
    slackApp.command('/load-trivia-quiz', async ({ command, ack, client, respond }) => {
        await ack(); // *** ACK מיידי: חובה! ***

        const quizId = command.text.trim();
        const channelId = command.channel_id;
        const userId = command.user_id;

        if (!quizId) {
            return client.chat.postEphemeral({
                channel: channelId,
                user: userId,
                text: "אנא ציינו מזהה חידון. לדוגמה: `/load-trivia-quiz 1`",
            });
        }

        // עוטפים את הלוגיקה האיטית ב-Async Wrapper
        (async () => {
            try {
                const result = await sendApiRequest(`/quiz/load/${quizId}`, {});
                await respond({
                    text: `✅ חידון מספר *${result.quizId}* נטען בהצלחה! יש בו ${result.totalQuestions} שאלות.`,
                    response_type: 'in_channel'
                });
            } catch (error) {
                await respond({
                    text: `❌ שגיאה בטעינת חידון *${quizId}*: ${error.message}`,
                    response_type: 'ephemeral'
                });
            }
        })();
    });

    // ----------------------------------------------------------------------
    // 2️⃣ פקודה: /post-trivia-invite (תיקון operation_timeout)
    // ----------------------------------------------------------------------
    slackApp.command('/post-trivia-invite', async ({ command, ack, client, respond }) => {
        await ack(); // *** ACK מיידי: חובה! ***

        (async () => {
            try {
                const statusData = await sendApiRequest('/quiz/current', {}, 'GET');

                let responseText, responseBlocks;

                if (statusData.status === 'finished' || statusData.message === 'No active quiz found.') {
                    responseText = "❌ אין חידון פעיל כרגע. טען אחד חדש בעזרת `/load-trivia-quiz [ID]`.";
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
                                    action_id: "start_trivia"
                                }
                            ]
                        }
                    ];
                }

                await respond({
                    text: responseText,
                    blocks: responseBlocks,
                    response_type: 'in_channel'
                });
            } catch (error) {
                await respond({
                    text: `❌ שגיאה בשליפת סטטוס הטריוויה: ${error.message}`,
                    response_type: 'ephemeral'
                });
            }
        })();
    });

    // --- שאר הפונקציות (action listeners, showQuestion, showGameResults) נשארות כפי ששיתפת אותן לאחרונה ---

    // הוסף את שאר ה-action listeners (start_trivia, answer_) ואת פונקציות ה-showQuestion/showGameResults/error handler
    
    // ...
};