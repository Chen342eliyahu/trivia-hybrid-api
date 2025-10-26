const { google } = require('googleapis');

// מזהה הגיליון שלך (נלקח מהקוד המקורי)
const SPREADSHEET_ID = '1qsAfchLpRGnjjOGUbia7_M0_jFtoinEs07FoaPKfKEw'; 
const RANGE_ALL_QUESTIONS = 'Sheet1!A:J';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

/**
 * פונקציה פנימית לטעינת כל השאלות הגולמיות מגיליון גוגל.
 */
async function loadAllRawTriviaQuestions() {
    try {
        const sheets = google.sheets({ version: 'v4', auth: GOOGLE_API_KEY });
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: RANGE_ALL_QUESTIONS,
        });

        const rows = res.data.values;
        if (!rows || rows.length < 2) { 
            console.log('No data or only headers found in Google Sheet.');
            return [];
        }

        const headers = rows[0];
        const questionsData = rows.slice(1);

        const allRawQuestions = questionsData.map(row => {
            const questionObj = {};
            headers.forEach((header, index) => {
                questionObj[header] = row[index];
            });

            // ניקוי ועיבוד:
            if (questionObj.CorrectAnswerIndex !== undefined && questionObj.CorrectAnswerIndex !== '') {
                questionObj.CorrectAnswerIndex = parseInt(questionObj.CorrectAnswerIndex, 10);
            } else {
                questionObj.CorrectAnswerIndex = -1;
            }

            const options = [];
            for (let i = 1; i <= 4; i++) {
                if (questionObj[`Option${i}`] !== undefined && questionObj[`Option${i}`] !== '') {
                    options.push(questionObj[`Option${i}`]);
                }
            }
            questionObj.options = options;
            
            for (let i = 1; i <= 4; i++) {
                delete questionObj[`Option${i}`];
            }

            return questionObj;
        }).filter(q => q.Question && q.Question.trim() !== '');
        
        console.log(`Loaded ${allRawQuestions.length} raw questions from Google Sheet.`);
        return allRawQuestions;

    } catch (err) {
        console.error('The API returned an error when loading all raw questions:', err);
        return [];
    }
}

/**
 * טוען את כל השאלות ומסנן לפי ID.
 */
async function loadAndFilterQuestions(questionnaireId) {
    const allRawQuestions = await loadAllRawTriviaQuestions();

    if (!allRawQuestions || allRawQuestions.length === 0) {
        return [];
    }

    const filtered = allRawQuestions.filter(q => 
        q.QuestionnaireID && String(q.QuestionnaireID).trim() === String(questionnaireId).trim() && 
        q.Question && q.Question.trim() !== '' && 
        q.options && q.options.length === 4 && 
        typeof q.CorrectAnswerIndex === 'number' && q.CorrectAnswerIndex >= 0 && q.CorrectAnswerIndex < 4 
    );

    if (filtered.length === 0) {
        console.log(`No valid questions found for Questionnaire ID: ${questionnaireId}.`);
    } else {
        console.log(`Filtered ${filtered.length} questions for Questionnaire ID: ${questionnaireId}.`);
    }

    return filtered;
}


module.exports = { loadAndFilterQuestions };