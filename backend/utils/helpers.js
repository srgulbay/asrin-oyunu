function getNumericGrade(gradeString) {
    if (!gradeString) return null;
    if (String(gradeString).toLowerCase() === 'okul öncesi') return 0;
    const gradeNum = parseInt(gradeString, 10);
    return isNaN(gradeNum) ? null : gradeNum;
}

module.exports = {
    getNumericGrade
};