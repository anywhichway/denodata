//import {intersection,union} from "array-set-ops";
//import {DONE} from "lmdb-query";
//import {ToWords} from "to-words";
//import {distance} from "fastest-levenshtein";
//const colorParse = (await import("color-parse")).default;
//const levenshteinDistance = distance;
//const toWords = new ToWords();

//soundex from https://gist.github.com/shawndumas/1262659
function soundex(a) {a=(a+"").toLowerCase().split("");var c=a.shift(),b="",d={a:"",e:"",i:"",o:"",u:"",b:1,f:1,p:1,v:1,c:2,g:2,j:2,k:2,q:2,s:2,x:2,z:2,d:3,t:3,l:4,m:5,n:5,r:6},b=c+a.map(function(a){return d[a]}).filter(function(a,b,e){return 0===b?a!==d[c]:a!==e[b-1]}).join("");return(b+"000").slice(0,4).toUpperCase()};

const validateLuhn = num => {
    let arr = (num + '')
        .split('')
        .reverse()
        .map(x => parseInt(x));
    let lastDigit = arr.splice(0, 1)[0];
    let sum = arr.reduce((acc, val, i) => (i % 2 !== 0 ? acc + val : acc + ((val * 2) % 9) || 9), 0);
    sum += lastDigit;
    return sum % 10 === 0;
}

var STOPWORDS = [
    'a', 'about', 'after', 'ala', 'all', 'also', 'am', 'an', 'and', 'another', 'any', 'are',
    'around','as', 'at', 'be',
    'because', 'been', 'before', 'being', 'between', 'both', 'but', 'by', 'came', 'can',
    'come', 'could', 'did', 'do', 'each', 'for', 'from', 'get', 'got', 'has', 'had',
    'he', 'have', 'her', 'here', 'him', 'himself', 'his', 'how', 'i', 'if', 'iff', 'in',
    'include', 'into',
    'is', 'it', 'like', 'make', 'many', 'me', 'might', 'more', 'most', 'much', 'must',
    'my', 'never', 'now', 'of', 'on', 'only', 'or', 'other', 'our', 'out', 'over',
    'said', 'same', 'see', 'should', 'since', 'some', 'still', 'such', 'take', 'than',
    'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
    'through', 'to', 'too', 'under', 'up', 'very', 'was', 'way', 'we', 'well', 'were',
    'what', 'where', 'which', 'while', 'who', 'with', 'would', 'you', 'your'];

const tokenize = (value,isObject) => (value.replace(new RegExp(`[^A-Za-z0-9\\s${isObject ? "\:" : ""}]`,"g"),"").replace(/  +/g," ").toLowerCase().split(" ").reduce((tokens,token) => {
    const value = parseFloat(token);
    isNaN(value) ? tokens.push(token) : tokens.push(...toWords.convert(token).split(" "));
    return tokens;
},[]));

const addToDictionary = (stringOrArray,dictionary) => {
    const words = Array.isArray(stringOrArray) ? stringOrArray : tokenize(stringOrArray).filter(word => !STOPWORDS.includes(word));
    words.forEach((word) => {
        dictionary[word] ||= 0;
        dictionary[word]++;
    });
    return words;
}

const _stringstoVectors = ({dictionary,normalize},...tokenLists) => {
    const vectors = [],
        maximums = [];
    Object.entries(dictionary).forEach(([token]) => {
        tokenLists.forEach((tokenList,i) => {
            vectors[i] ||= {};
            vectors[i][token] ||= 0;
            if(tokenList.includes(token)) {
                vectors[i][token]++;
            }
            maximums[i] = Math.max(maximums[i]|| 0,vectors[i][token]);
        });
    });
    return vectors.map((vector,i) => Object.values(vector).map((value) => value/ (normalize ? maximums[i] : 1)));
}

const stringsToVectors = (options,...tokenizedStrings) => {
    const dictionary = {};
    return _stringstoVectors({dictionary,...options},...tokenizedStrings.map(tokens => addToDictionary(tokens,dictionary)));
}

const colorsToVectors = (options,...colors) => {
    return colors.map(color => {
        if(typeof(color) !== "string") throw new TypeError("Color must be a string");
        let array;
        const parsed = colorParse(color.toLowerCase());
        if(parsed?.space === "rgb") {
            array = [...parsed.values,parsed.alpha]
        }
        return array ? array.map((v,i) => i<=2 ? v / 255 : v) : null;
    })
}

// ensure vectors have the same dimensions
function removeNulls(vector1,vector2) {
    const v1 = [...vector1],
        v2 = [...vector2];
    for(let i=0;i<v1.length;i++) {
        if(v1[i]===null || v2[i]===null) {
            v1.splice(i,1);
            v2.splice(i,1);
            i--;
        }
    }
    return [v1,v2];
}

function colorDistance(a, b) {
    return euclidianDistance(a,b,{normalize:false,vectorize:colorsToVectors});
}

function euclidianDistance(a, b,{normalize,vectorize=stringsToVectors}={}) {
    return Math.sqrt(simpleDistance(a,b,{normalize,vectorize}));
}

function simpleDistance(a, b,{normalize,vectorize=stringsToVectors}={}) {
    if(!Array.isArray(a) || !Array.isArray(b)) {
        if(Array.isArray(a) || Array.isArray(b)) throw new TypeError("Cannot compute Euclidean distance between array and non-array values");
        [a,b] = vectorize({normalize},a,b);
    }
    [a,b] = removeNulls(a,b);
    if(a.length!==b.length) throw new Error("Cannot compute Euclidean distance between vectors of different dimensions");
    return a.map((x, i) => {
        if(typeof(x) !== "number" || typeof(b[i]) !== "number") throw new TypeError("Cannot compute Euclidean distance between non-numeric values");
        return Math.abs( x - b[i] ) ** 2  // square the difference
    }).reduce((sum, now) => sum + now) // sum
}

function manhattanDistance(a, b,{normalize,vectorize=stringsToVectors}={}) {
    if(!Array.isArray(a) || !Array.isArray(b)) {
        if(Array.isArray(a) || Array.isArray(b)) throw new TypeError("Cannot compute Manhattan distance between array and non-array values");
        [a,b] = vectorize({normalize},a,b);
    }
    [a,b] = removeNulls(a,b);
    if(a.length!==b.length) throw new Error("Cannot compute Manhattan distance between vectors of different dimensions")
    return a.map((x, i) => {
        if(typeof(x) !== "number" || typeof(b[i]) !== "number") throw new TypeError("Cannot compute Manhattan distance between non-numeric values")
        return Math.abs(x - b[i])
    }).reduce((sum, now) => sum + now)
}

function jaccardDistance(a, b) {
    const typea = typeof(a),
        typeb = typeof(b);
    if(typea==="string") {
        a = tokenize(a).filter(word => !STOPWORDS.includes(word));
    }
    if(typeb==="string") {
        b = tokenize(b).filter(word => !STOPWORDS.includes(word));
    }
    if(!Array.isArray(a) || !Array.isArray(b)) {
        throw new TypeError("Cannot compute Jaccard distance between non-array values");
    }
    const i = intersection(a, b),
        u = union(a, b);
    return 1 - (i.length / u.length);
}

function cosineDistance(a, b) {
    const typea = typeof(a),
        typeb = typeof(b);
    if(a==null || b==null) {
        throw new TypeError("Cannot compute cosine distance between null values");
    }
    if(typea!==typeb) {
        throw new TypeError("Cannot compute cosine distance between different types");
    }
    if(typea==="string") {
        const dictionary = {};
        [a,b] = stringsToVectors({dictionary},addToDictionary(a,dictionary),addToDictionary(b,dictionary));
    }
    if(!Array.isArray(a) || !Array.isArray(b)) {
        throw new TypeError("Cannot compute cosine distance between non-array values");
    }
    [a,b] = removeNulls(a,b);
    if(a.length!==b.length) throw new Error("Cannot compute cosine distance between vectors of different dimensions");
    const dotProduct = a.map((x, i) => a[i] * b[i]).reduce((sum, now) => sum + now);
    if(dotProduct===0) return 1;
    const magnitudeA = Math.sqrt(a.map(x => x ** 2).reduce((sum, now) => sum + now))
    const magnitudeB = Math.sqrt(b.map(x => x ** 2).reduce((sum, now) => sum + now))
    return 1 - (dotProduct / (magnitudeA * magnitudeB))
}

/*function diceSimilarity(a, b) {
    const intersection = a.filter(x => b.includes(x))
    return 2 * intersection.length / (a.length + b.length)
}*/

const operators = {

    //$and
    //$or
    //$not
    //$xor
    //$ior


    $type(right, {test}) {
        return typeof(right)===test ? right : undefined
    },
    $isPrime(value) {
        if (value===1) return undefined;
        for (let i=2; i<value; i++) {
            if (value%i===0) return undefined;
        }
        return value;
    },
    $isOdd(value) {
        return value%2===1 ? value : undefined
    },
    $isEven(value) {
        return value%2===0 ? value : undefined
    },
    $isPositive(value) {
        return value>0 ? value : undefined
    },
    $isNegative(value) {
        return value<0 ? value : undefined
    },
    $isInteger(value) {
        return Number.isInteger(value) ? value : undefined
    },
    $isFloat(value) {
        const str = value+"",
            parts = str.split(".");
        return parts.length==2 ? value : undefined
    },
    $isNaN(value) {
        return Number.isNaN(value) ? value : undefined
    },
    $isTruthy(value) {
        return value ? value : undefined
    },
    $isFalsy(value) {
        return !value ? value : undefined
    },
    $isNull(value) {
        return value===null ? value : undefined
    },
    $isUndefined(value) {
        return value===undefined ? value : undefined
    },
    $isDefined(value) {
        return value!==undefined ? value : undefined
    },
    $isPrimitive(value) {
        const type = typeof(value);
        return !["object","function"].includes(type) ? value : undefined;
    },
    $isArray(value) {
        return Array.isArray(value) ? value : undefined
    },
    $isObject(value) {
        return typeof(value)==="object" && value ? value : undefined
    },
    $isCreditCard(value) {
        //  Visa || Mastercard || American Express || Diners Club || Discover || JCB
        return typeof(value)==="string" && (/(?:\d[ -]*?){13,16}/g).test(value) && validateLuhn(value) ? value : undefined;
    },
    $isEmail(value) {
        return typeof(value)==="string" && (!/(\.{2}|-{2}|_{2})/.test(value) && /^[a-z0-9][a-z0-9-_\.]+@[a-z0-9][a-z0-9-]+[a-z0-9]\.[a-z]{2,10}(?:\.[a-z]{2,10})?$/i).test(value) ? value : undefined;
    },
    $isURL(value) {
        return typeof(value)==="string" && (/^(?:https?|ftp):\/\/[^\s/$.?#].[^\s]*$/is).test(value) ? value : undefined;
    },
    $isUUID(value) {
        return typeof(value)==="string" && (/^[a-f\d]{8}(-[a-f\d]{4}){4}[a-f\d]{8}$/is).test(value) ? value : undefined;
    },
    $isIPv4Address(value) {
        return typeof(value)==="string" && (/(([2]([0-4][0-9]|[5][0-5])|[0-1]?[0-9]?[0-9])[.]){3}(([2]([0-4][0-9]|[5][0-5])|[0-1]?[0-9]?[0-9]))/gi).test(value) ? value : undefined;
    },
    $isIPv6Address(value) {
        return typeof(value)==="string" && (/(([a-fA-F0-9]{1,4}|):){1,7}([a-fA-F0-9]{1,4}|:)/gmi).test(value) ? value : undefined;
    },
    $isSSN(value) {
        return typeof(value)==="string" && (/^\d{3}-?\d{2}-?\d{4}$/is).test(value) ? value : undefined;
    },
    $isISBN(value) {
        return typeof(value)==="string" && (/^(?:ISBN(?:-1[03])?:?\s)?(?=[-0-9\s]{17}$|[-0-9X\s]{13}$|[0-9X]{10}$)(?:97[89][-\s]?)?[0-9]{1,5}[-\s]?(?:[0-9]+[-\s]?){2}[0-9X]$/).test(value) ? value : undefined;
    },
    $isHexColor(value) {
        return typeof(value)==="string" && (/^#?([a-f0-9]{6}|[a-f0-9]{3})$/i).test(value) ? value : undefined;
    },
    $isMACAddress(value) {
        return typeof(value)==="string" && (/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i).test(value) ? value : undefined;
    },
    $isZIPCode(value) {
        return  typeof(value)==="string" && (/[0-9]{5}(-[0-9]{4})?/g).test(value) ? value : undefined;
    },

    $lt(right, {test}) {
        return right<test ? right : DONE
    },
    $lte(right, {test}) {
        return right<=test ? right : DONE
    },
    $eq(right, {test}) {
        return right==test ? right : undefined
    },
    $eeq(right, {test}) {
        return right===test ? right : undefined
    },
    $neq(right, {test}) {
        return right!=test ? right : undefined
    },
    $gte(right, {test}) {
        return right>=test ? right : undefined
    },
    $gt(right, {test}) {
        return right>test ? right : undefined
    },

    $between(right, {test}) {
        return right>=test[0] && right<=test[1] ? right : right>test[1] ? DONE : undefined
    },
    $outside(right, {test}) {
        return right<test[0] || right>test[1] ? right : undefined
    },
    $in(right, {test}) {
        return test.includes(right) ? right : undefined
    },
    $nin(right, {test}) {
        return !test.includes(right) ? right : undefined
    },
    $includes(right, {test}) {
        return test.includes && test.includes(right) ? right : undefined
    },
    $excludes(right, {test}) {
        return !test.includes || !test.includes(right) ? right : undefined
    },

    $intersects(right, {test}) {
        return Array.isArray(right) && Array.isArray(test)  && right.some((item) => test.includes(item)) ? right : undefined
    },
    $disjoint(right, {test}) {
        return Array.isArray(right) && Array.isArray(test)  && !right.some((item) => test.includes(item)) ? right : undefined
    },
    $subset(right, {test}) {
        return Array.isArray(right) && Array.isArray(test)  && right.every((item) => test.includes(item)) ? right : undefined
    },
    $superset(right, {test}) {
        return Array.isArray(right) && Array.isArray(test)  && test.every((item) => right.includes(item)) ? right : undefined
    },
    $symmetric(right, {test}) {
        return Array.isArray(right) && Array.isArray(test) && right.length===test.length && right.every((item) => test.includes(item)) ? right : undefined
    },
    $startsWith(right, {test}) {
        test = typeof(test)==="number" ? test+"" : test;
        return right.startsWith && right.startsWith(test) ? right : undefined
    },
    $endsWith(right, {test}) {
        test = typeof(test)==="number" ? test+"" : test;
        return right.endsWith && right.endsWith(test) ? right : undefined
    },
    $length(right, {test}) {
        return right.length==test ? right : undefined
    },

    $matches(right, {test}) {
        const value = typeof(right)==="number" ? right+"" : right;
        return typeof(value)==="string" && value.match(test) ? right : undefined
    },
    $similar(right, {test}) { // same as $matches, familiar to SQL developers
        const value = typeof(right)==="number" ? right+"" : right;
        return typeof(value)==="string" && value.match(test) ? right : undefined
    },
    $echoes(right, {test}) {
        const _right = typeof(right)==="number" ? toWords.convert(right) : right,
            _test = typeof(test)==="number" ? toWords.convert(test) : test;
        return typeof(_right)==="string" && typeof(_test)==="string" && soundex(_right)===soundex(_test) ? right : undefined
    },
    $distance(right, {test},throws) { // trap only used in testing
        let _right = right,_test = test,_compare,_options;
        if(Array.isArray(right)) {
            _right = right[0];
            _compare = right[1];
            _options = right[2]||{};
        } else {
            _test = test[0];
            _compare = test[1];
            _options = test[2]||{};
        }
        try {
            const {method=typeof(_test)==="string" ? levenshteinDistance : simpleDistance,vectorize} = _options,
                distance = method(_right,_test,{normalize:_compare < 1 ? true : false,vectorize}),
                result = _compare<1 ? distance/Math.max(_right.length,_test.length) : distance;
            if(result<=_compare) {
                return result;
            }
        } catch(e) {
            if(throws) throw e;
        }
    },

    $add(right, {test}) {
        return right+test[0]===test[1] ? right : undefined
    },
    $subtract(right, {test}) {
        return right-test[0]===test[1] ? right : undefined
    },
    $multiply(right, {test}) {
        return right*test[0]===test[1] ? right : undefined
    },
    $divide(right, {test}) {
        return right/test[0]===test[1] ? right : undefined
    },
    $mod(right, {test}) {
        return right%test[0]===test[1] ? right : undefined
    },
    $pow(right, {test}) {
        return right**test[0]===test[1] ? right : undefined
    },

/*
    $$if(right, {test}) {
        return right===test[0] ? test[1] : test[2]
    },
    $$case(right, {test}) {
        const dflt = test.length/2!==0 ? test.pop() : undefined,
            pair = () => test.length>0 ? [test.shift(), test.shift()] : undefined;
        let next;
        while(next=pair()) {
            if(next[0]===right) return next[1];
        }
    },
    $$concat(right, {test}) {
        return Array.isArray(test) && Array.isArray(right) ? right.concat(test) : right + test;
    },
    $$join(right, {test}) {
        right = Array.isArray(right) ? right : [right];
        return right.join(test)
    },
    $$slice(right, {test}) {
        return Array.isArray(test) && Array.isArray(right) ? right.slice(...test) : typeof(right)==="string" ? right.substring(...test) : undefined;
    },
    $$substring(right, {test}) {
        return typeof(right)==="string" ? right.substring(...test) : undefined;
    },
    $$replace(right, {test}) {
        return typeof(right)==="string" ? right.replace(...test) : undefined;
    },
    $$split(right, {test}) {

    },
    $$trim(right, {test}) {

    },
    $$padStart(right, {test}) {

    },
    $$add(right, {test}) {
        return typeof(right)==="number" ? right+test : undefined;
    },
    $$subtract(right, {test}) {
        return  typeof(right)==="number" ? right-test : undefined;
    },
    $$multiply(right, {test}) {
        return  typeof(right)==="number" ? right*test : undefined;
    },
    $$divide(right, {test}) {
        return  typeof(right)==="number" ? right/test : undefined;
    },
    $$mod(right, {test}) {
        return  typeof(right)==="number" ? right%test : undefined
    },
    $$pow(right, {test}) {
        return  typeof(right)==="number" ? right**test : undefined;
    },
    ...["abs", "ceil", "floor", "round", "sign", "sqrt", "trunc","cos","sin","tan","acos","asin","atan","atan2","exp","log","max","min","random"].reduce((acc,fn) => {
        acc["$$"+fn] = (right, {test}) => typeof(right)==="number" ? Math[fn](right) : undefined;
        return acc;
    },{})
*/
}

const functionalOperators = Object.entries(operators).reduce((operators,[key,f]) => {
    operators[key] = function(test) {
        let join;
        const op = (left,right) => {
            return join ? f(left,right) : f(left,{test});
        }
        return op;
    }
    operators.$and = (...tests) => {
        const op = (left,right) => {
            op.score = 1;
            for(const test of tests) {
                const type = typeof(test),
                    result = type==="function" ? test(left,right) : (test===left ? test : undefined);
                if(result==undefined) {
                    op.score = 0;
                    break;
                }
            }
            return op.score > 0 ? true : undefined;
        }
        return op;
    }
    operators.$or = (...tests) => {
        const op = (left,right) => {
            op.score = 0;
            for(const test of tests) {
                const type = typeof(test),
                    result = type==="function" ? test(left,right) : (test===left ? test : undefined);
                if(result!==undefined) {
                    op.score = 1;
                    break;
                }
            }
            return op.score > 0 ? true : undefined;
        }
        return op;
    }
    operators.$ior = (minScore,...tests) => {
        const op = (left,right) => {
            let count = 0;
            op.score = 0;
            for(const test of tests) {
                const type = typeof(test),
                    result = type==="function" ? test(left,right) : (test===left ? test : undefined);
                if(result!==undefined) {
                    count += type=="function" ? typeof(test.score)==="number" ? test.score : 1 : 1;
                }
            }
            op.score = count/tests.length;
            return op.score > minScore ? true : undefined;
        }
        return op;
    }
    operators.$not = (...tests) => {
        const op = (left,right) => {
            op.score = 0;
            for(const test of tests) {
                const result = typeof(test)==="function" ? test(left,right) : (test===left ? test : undefined);
                if(result!==undefined) {
                    op.score = 1;
                    break;
                }
            }
            return op.score > 0 ? true : undefined;
        }
        return op;
    }
    return operators;
},{});

export {functionalOperators as default, functionalOperators as operators};
//export {operators as default,operators,DONE,STOPWORDS,tokenize,jaccardDistance,simpleDistance,euclidianDistance,manhattanDistance,cosineDistance,levenshteinDistance,colorDistance,colorsToVectors,stringsToVectors}
