// ----------------------------------------------------------------------
// 1️⃣ פקודה חדשה: /load-trivia-quiz-new [ID]
// ----------------------------------------------------------------------
slackApp.command('/load-trivia-quiz-new', async ({ command, ack, client, respond }) => {
    await ack(); // ⚡ חובה: ack מיידי למניעת timeout

    const quizId = command.text.trim();
    const channelId = command.channel_id;
    const userId = command.user_id;

    if (!quizId) {
        return client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "אנא ציינו מזהה חידון. לדוגמה: `/load-trivia-quiz-new 1`",
        });
    }

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
});


// ----------------------------------------------------------------------
// 2️⃣ פקודה חדשה: /post-trivia-invite-new
// ----------------------------------------------------------------------
slackApp.command('/post-trivia-invite-new', async ({ command, ack, client, respond }) => {
    await ack(); // ⚡ חובה ack מיידי

    // נריץ את הלוגיקה האיטית בצורה אסינכרונית כדי לא לחסום את ack
    (async () => {
        try {
            const statusData = await sendApiRequest('/quiz/current', {}, 'GET');

            let responseText, responseBlocks;

            if (statusData.status === 'finished' || statusData.message === 'No active quiz found.') {
                responseText = "❌ אין חידון פעיל כרגע. טען אחד חדש בעזרת `/load-trivia-quiz-new [ID]`.";
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
