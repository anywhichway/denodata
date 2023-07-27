const validateLuhn = num => {
    const arr= (num + '')
            .split('')
            .reverse()
            .map(x => parseInt(x)),
        lastDigit= arr.splice(0, 1)[0];
    let sum = arr.reduce((acc, val, i) => (i % 2 !== 0 ? acc + val : acc + ((val * 2) % 9) || 9), 0);
    sum += lastDigit;
    return sum % 10 === 0;
}
export { validateLuhn, validateLuhn as default };