const fetch = require('node-fetch');

// הוסף את השורה הבאה אם אתה משתמש בגרסה 3.x (כמו 3.3.2):
// זה מוודא שאנחנו משתמשים ב-fetch מהייצוא הנכון של הספרייה.
// *** ודא שאתה משתמש בזה ***
const fetch = require('node-fetch').default || require('node-fetch');

module.exports = (slackApp) => {

  async function sendApiRequest(endpoint, data = {}, method = 'POST') {
    const baseUrl = process.env.API_EXTERNAL_URL || 'http://localhost:3000/api';
    const url = `${baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify(data) : undefined
      });
      return await response.json();
    } catch (error) {
      console.error('FETCH ERROR:', error);
      throw error;
    }
  }

  // -----------------------------------------------
  // /load-trivia-quiz-new
  // -----------------------------------------------
  slackApp.command('/load-trivia-quiz-new', async ({ command, ack, client, respond }) => {
    await ack();
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

  // -----------------------------------------------
  // /post-trivia-invite-new
  // -----------------------------------------------
  slackApp.command('/post-trivia-invite-new', async ({ command, ack, client, respond }) => {
    await ack();

    try {
      const statusData = await sendApiRequest('/quiz/current', {}, 'GET');

      if (statusData.status === 'finished' || statusData.message === 'No active quiz found.') {
        await respond({
          text: "❌ אין חידון פעיל כרגע. טען אחד חדש בעזרת `/load-trivia-quiz-new [ID]`.",
          response_type: 'ephemeral'
        });
      } else {
        const totalQuestions = statusData.question.total;
        await respond({
          text: `🧠 אתגר הטריוויה השבועי מוכן! 🎯 יש ${totalQuestions} שאלות.`,
          response_type: 'in_channel'
        });
      }
    } catch (error) {
      await respond({
        text: `❌ שגיאה בשליפת סטטוס הטריוויה: ${error.message}`,
        response_type: 'ephemeral'
      });
    }
  });

  slackApp.error((error) => {
    console.error('Slack app error:', error);
  });
};
