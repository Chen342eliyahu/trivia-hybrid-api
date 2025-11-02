// 💡 אם אתה מריץ Node.js 22, המשתנה 'fetch' כבר גלובלי.
// אנו נסמוך על כך שהוא גלובלי, וכך נימנע משגיאת 'already declared'.

module.exports = (slackApp) => {

    // הגדרה סופית: הכתובת שאליה השרת צריך להתחבר כדי לדבר עם עצמו
    let RENDER_INTERNAL_URL;
    if (process.env.PORT) {
        // אם רץ ב-Render, השתמש בכתובת הפנימית של Container: http://localhost:PORT
        RENDER_INTERNAL_URL = `http://localhost:${process.env.PORT}/api`;
    } else {
        // אם רץ מקומית, השתמש ב-localhost:3000
        RENDER_INTERNAL_URL = 'http://localhost:3000/api'; 
    }
    
    // 💡 כעת, sendApiRequest משתמשת בכתובת המקומית הפנימית
    const API_BASE_URL = RENDER_INTERNAL_URL;


    // --- פונקציות עזר לשליחת בקשות HTTP (fetch) ל-API שלנו ---
    async function sendApiRequest(endpoint, data = {}, method = 'POST') {
        
        // 1. הסרת הקו הנטוי המוביל מה-endpoint
        const cleanedEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
        
        // 2. בניית ה-URL הסופי: http://localhost:10000/api/quiz/load/1
        const url = `${API_BASE_URL}/${cleanedEndpoint}`;
        
        // ... שאר הפונקציה (לוגיקת fetch) נשארת כפי שהייתה
        
        // ...
        
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
