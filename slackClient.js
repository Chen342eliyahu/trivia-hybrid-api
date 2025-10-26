// slackClient.js

// 💡 הקובץ הזה יקבל את מופע slackApp כארגומנט מהקובץ index.js
module.exports = (slackApp) => {

    const API_BASE_URL = 'http://localhost:3000/api'; 

    // --- פונקציות עזר לשליחת בקשות HTTP (fetch) ל-API שלנו ---
    async function sendApiRequest(endpoint, data = {}, method = 'POST') {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'POST' ? JSON.stringify(data) : undefined
            });
            const result = await response.json();

            if (!response.ok) {
                console.error(`API Error on ${endpoint}:`, result.message || response.statusText);
                throw new Error(result.message || `API call failed with status: ${response.status}`);
            }
            return result;

        } catch (error) {
            console.error(`FETCH ERROR to ${endpoint}:`, error.message);
            throw new Error(`Failed to communicate with API: ${error.message}`);
        }
    }

    // ----------------------------------------------------------------------
    // 1. פקודה: /load-trivia-quiz [ID]
    // ----------------------------------------------------------------------
    slackApp.command('/load-trivia-quiz', async ({ command, ack, client, respond }) => {
        await ack(); 

        const quizId = command.text.trim();
        const channelId = command.channel_id;
        const userId = command.user_id;

        if (!quizId) {
            return client.chat.postEphemeral({
                channel: channelId,
                user: userId,
                text: "Please specify a questionnaire ID (e.g., `/load-trivia-quiz 1`).",
            });
        }

        await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: `Attempting to load Quiz ID: *${quizId}*...`,
        });

        try {
            const result = await sendApiRequest(`/quiz/load/${quizId}`, {}); 

            await respond({
                text: `✅ Successfully loaded trivia questions for Quiz ID: *${result.quizId}*! There are ${result.totalQuestions} questions ready.`,
                response_type: 'in_channel'
            });

        } catch (error) {
            await respond({
                text: `❌ Failed to load quiz ID: *${quizId}*. Error: ${error.message}`,
                response_type: 'in_channel' 
            });
        }
    });


    // ----------------------------------------------------------------------
    // 2. פקודה: /post-trivia-invite 
    // ----------------------------------------------------------------------
    slackApp.command('/post-trivia-invite', async ({ command, ack, client }) => {
        await ack(); 

        // בדיקה ראשונית של מצב המשחק דרך ה-API (GET)
        const statusData = await sendApiRequest('/quiz/current', {}, 'GET');
        
        if (statusData.status === 'finished' || statusData.message === 'No active quiz found.') {
            await client.chat.postMessage({
                channel: command.channel_id,
                text: "❌ Cannot start trivia: No questions loaded! Please load a questionnaire using `/load-trivia-quiz [ID]` first.",
                response_type: 'ephemeral'
            });
            return;
        }
        
        const totalQuestions = statusData.question.total; 

        try {
            await client.chat.postMessage({
                channel: command.channel_id,
                text: "🧠 Weekly Trivia Challenge! 🎯",
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*🧠 Weekly Trivia Challenge! 🎯*\n\nReady to test your knowledge? This quiz has ${totalQuestions} questions!\n\n` 
                        }
                    },
                    {
                        type: "actions",
                        elements: [
                            {
                                type: "button",
                                text: { type: "plain_text", text: "🚀 Start Trivia" },
                                style: "primary",
                                action_id: "start_trivia"
                            }
                        ]
                    }
                ]
            });
        } catch (error) {
            console.error('Error posting trivia invitation:', error);
        }
    });

    // ----------------------------------------------------------------------
    // 3. טיפול בלחיצה על כפתור "Start Trivia" 
    // ----------------------------------------------------------------------
    slackApp.action('start_trivia', async ({ body, ack, client }) => {
        await ack();
        const userId = body.user.id;
        const triggerId = body.trigger_id;

        // *** קריאה ל-API לשליפת נתוני המשחק הנוכחי ***
        const statusData = await sendApiRequest('/quiz/current', {}, 'GET');
        
        if (statusData.status === 'finished' || statusData.message === 'No active quiz found.') {
            return client.chat.postEphemeral({
                channel: body.channel.id,
                user: userId,
                text: "❌ Cannot start trivia: No active quiz. Load one using `/load-trivia-quiz [ID]` first.",
            });
        }

        const question = statusData.question;
        const currentQuizId = statusData.quizId || 'N/A';
        
        await showQuestion(client, triggerId, userId, question, currentQuizId, question.total);
    });

    // ----------------------------------------------------------------------
    // 4. טיפול בבחירת תשובה (action)
    // ----------------------------------------------------------------------
    slackApp.action(/answer_/, async ({ body, ack, client, action }) => {
        await ack();

        const userId = body.user.id;
        const actionParts = action.action_id.split('_'); 
        const questionIndex = parseInt(actionParts[2], 10); 
        const selectedAnswerIndex = parseInt(actionParts[3], 10); 
        const viewId = body.view.id; 

        try {
            // *** קריאה ל-API לשליחת התשובה ***
            await sendApiRequest('/answer', {
                userId: userId,
                questionIndex: questionIndex,
                selectedAnswerIndex: selectedAnswerIndex
            });
        } catch (error) {
            if (error.message.includes('already answered')) {
                 await client.chat.postEphemeral({ channel: body.channel.id, user: userId, text: "You've already answered this question. Moving to the next one..." });
            } else {
                 return client.chat.postEphemeral({ channel: body.channel.id, user: userId, text: `Error submitting answer: ${error.message}` });
            }
        }
        
        // *** קריאה ל-API למעבר לשאלה הבאה ***
        const nextQuestionResult = await sendApiRequest('/quiz/next');

        if (nextQuestionResult.finished) {
            await showGameResults(client, viewId, userId, nextQuestionResult.leaderboard);
            return;
        }
        
        const nextQ = nextQuestionResult.question;
        await showQuestion(client, viewId, userId, nextQ, nextQ.quizId || 'N/A', nextQ.total, true);
    });

    // ----------------------------------------------------------------------
    // 5. פונקציות תצוגה מעודכנות (משתמשות ב-API)
    // ----------------------------------------------------------------------

    async function showQuestion(client, triggerOrViewId, userId, question, quizId, totalQuestions, isUpdate = false) {
        const questionIndex = question.index - 1;

        const scoreData = await sendApiRequest(`/results/${userId}`, {}, 'GET');
        const currentScore = scoreData.currentScore || 0;
        const answeredCount = scoreData.answers ? scoreData.answers.length : 0;
        
        const questionBlocks = question.options.map((option, index) => ({
            type: "section",
            text: { type: "mrkdwn", text: `*${index + 1}.* ${option}` },
            accessory: {
                type: "button",
                text: { type: "plain_text", text: "Select" },
                action_id: `answer_${quizId}_${questionIndex}_${index}`, 
                value: `${questionIndex}_${index}`
            }
        }));

        const viewBlocks = [
            { type: "section", text: { type: "mrkdwn", text: `*Question ${question.index}/${totalQuestions}*\n\n*${question.question}*` } },
            ...questionBlocks, 
            { type: "context", elements: [ { type: "mrkdwn", text: `Current Score: ${currentScore}/${answeredCount}` } ] }
        ];

        const viewPayload = {
            type: "modal",
            callback_id: "trivia_question",
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
        const resultsData = await sendApiRequest(`/results/${userId}`, {}, 'GET');

        const finalScore = resultsData.currentScore;
        const totalQuestions = resultsData.totalQuestions; 
        const answers = resultsData.answers;
        const percentage = totalQuestions > 0 ? Math.round((finalScore / totalQuestions) * 100) : 0;
        
        let performanceMessage = percentage >= 80 ? "🌟 Excellent work!" : "💪 Keep practicing!";

        const leaderboardBlocks = [
            { type: "section", text: { type: "mrkdwn", text: "*🏅 Leaderboard - Top Players!*" } },
            { type: "divider" }
        ];

        gameLeaderboard.slice(0, 5).forEach((player, index) => {
            leaderboardBlocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${['🥇', '🥈', '🥉'][index] || `${index + 1}.`} <@${player.userId}>*\nScore: *${player.currentGameScore}*`
                }
            });
        });
        leaderboardBlocks.push({ type: "divider" });

        const summaryBlocks = [];
        answers.forEach((answer, index) => {
            const moreInfoLink = answer.moreInfoLink;
            
            summaryBlocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Question ${index + 1}:* ${answer.questionText || 'N/A'}\n` +
                        `*Your Answer:* ${answer.selectedAnswer || 'N/A'} ${answer.isCorrect ? "✅ Correct" : "❌ Incorrect"}\n` +
                        `*Correct Answer:* ${answer.correctAnswer || 'N/A'}\n` +
                        `*Explanation:* ${answer.explanation || 'No explanation provided.'}` +
                        (moreInfoLink ? `\n*<${moreInfoLink}|More Info>*` : '')
                }
            });
            summaryBlocks.push({ type: "divider" });
        });

        try {
            await client.views.update({
                view_id: viewId,
                view: {
                    type: "modal",
                    callback_id: "trivia_results",
                    title: { type: "plain_text", text: `Trivia Results 🏆` },
                    blocks: [
                        ...leaderboardBlocks,
                        {
                            type: "section",
                            text: { type: "mrkdwn", text: `*🎯 Your Score: ${finalScore}/${totalQuestions} (${percentage}%)*\n\n${performanceMessage}` }
                        },
                        { type: "divider" },
                        {
                            type: "section",
                            text: { type: "mrkdwn", text: `*Quiz ID: ${resultsData.quizId || 'N/A'}*\n\n*Detailed Summary:*` }
                        },
                        ...summaryBlocks,
                        {
                            type: "actions",
                            elements: [
                                { type: "button", text: { type: "plain_text", text: "🔄 Play Again" }, style: "primary", action_id: "start_trivia" },
                            ]
                        }
                    ]
                }
            });
        } catch (error) {
            console.error('Error showing results:', error);
        }
    }

    slackApp.error((error) => {
        console.error('Slack app error:', error);
    });
};