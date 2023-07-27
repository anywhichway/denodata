//import {intersection,union} from "array-set-ops";
//import {distance} from "https://www.npmjs.com/package/fastest-levenshtein";
//import {ToWords} from "https://unpkg.com/to-words";
//const colorParse = (await import("https://www.npmjs.com/package/color-parse")).default;
//const levenshteinDistance = distance;
//const toWords = new ToWords();

import {DONE} from "./src/constants.js";
import soundex from "./src/soundex.js";
import validateLuhn from "./src/validate-luhn.js";


type Operator = (right:any, params?: { test?:any}) => any;
type CompoundOperator = ((...args:any) => any) & {count?:number,possibleCount?:number};

const operators:{[key:string]:Operator} = {

    $type(right, {test}={}) {
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
        return typeof(value)==="string" && /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(value) ? value : undefined;
    },
    $isURL(value) {
        return typeof(value)==="string" && (/^(?:https?|ftp):\/\/[^\s/$.?#].\S*$/is).test(value) ? value : undefined;
    },
    $isUUID(value) {
        return typeof(value)==="string" && (/^[a-f\d]{8}(-[a-f\d]{4}){4}[a-f\d]{8}$/is).test(value) ? value : undefined;
    },
    $isIPv4Address(value) {
        return typeof(value)==="string" && (/((2([0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9])[.]){3}((2([0-4][0-9]|5[0-5])|[0-1]?[0-9]?[0-9]))/gi).test(value) ? value : undefined;
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

    $lt(right, {test}={}) {
        return right<test ? right : DONE
    },
    $lte(right, {test}={}) {
        return right<=test ? right : DONE
    },
    $eq(right, {test}={}) {
        return right==test ? right : undefined
    },
    $eeq(right, {test}={}) {
        return right===test ? right : undefined
    },
    $neq(right, {test}={}) {
        return right!=test ? right : undefined
    },
    $gte(right, {test}={}) {
        return right>=test ? right : undefined
    },
    $gt(right, {test}={}) {
        return right>test ? right : undefined
    },

    $between(right, {test}={}) {
        return right>=test[0] && right<=test[1] ? right : right>test[1] ? DONE : undefined
    },
    $outside(right, {test}={}) {
        return right<test[0] || right>test[1] ? right : undefined
    },
    $in(right, {test}={}) {
        return test.includes(right) ? right : undefined
    },
    $nin(right, {test}={}) {
        return !test.includes(right) ? right : undefined
    },
    $includes(right, {test}={}) {
        return test.includes && test.includes(right) ? right : undefined
    },
    $excludes(right, {test}={}) {
        return !test.includes || !test.includes(right) ? right : undefined
    },

    $intersects(right, {test}={}) {
        return Array.isArray(right) && Array.isArray(test)  && right.some((item) => test.includes(item)) ? right : undefined
    },
    $disjoint(right, {test}={}) {
        return Array.isArray(right) && Array.isArray(test)  && !right.some((item) => test.includes(item)) ? right : undefined
    },
    $subset(right, {test}={}) {
        return Array.isArray(right) && Array.isArray(test)  && right.every((item) => test.includes(item)) ? right : undefined
    },
    $superset(right, {test}={}) {
        return Array.isArray(right) && Array.isArray(test)  && test.every((item) => right.includes(item)) ? right : undefined
    },
    $symmetric(right, {test}={}) {
        return Array.isArray(right) && Array.isArray(test) && right.length===test.length && right.every((item) => test.includes(item)) ? right : undefined
    },
    $startsWith(right, {test}={}) {
        test = typeof(test)==="number" ? test+"" : test;
        return right.startsWith && right.startsWith(test) ? right : undefined
    },
    $endsWith(right, {test}={}) {
        test = typeof(test)==="number" ? test+"" : test;
        return right.endsWith && right.endsWith(test) ? right : undefined
    },
    $length(right, {test}={}) {
        return right.length==test ? right : undefined
    },

    $matches(right, {test}={}) {
        const value = typeof(right)==="number" ? right+"" : right;
        return typeof(value)==="string" && value.match(test) ? right : undefined
    },
    $similar(right, {test}={}) { // same as $matches, familiar to SQL developers
        return this.$matches(right, {test});
    },
    $echoes(right, {test}={}) {
        return typeof(right)==="string" && typeof(test)==="string" && soundex(right)===soundex(test) ? right : undefined
    },
    $soundsLike(...args) {
        return this.$echoes(...args)
    },

    $add(right, {test}={}) {
        return right+test[0]===test[1] ? right : undefined
    },
    $subtract(right, {test}={}) {
        return right-test[0]===test[1] ? right : undefined
    },
    $multiply(right, {test}={}) {
        return right*test[0]===test[1] ? right : undefined
    },
    $divide(right, {test}={}) {
        return right/test[0]===test[1] ? right : undefined
    },
    $mod(right, {test}={}) {
        return right%test[0]===test[1] ? right : undefined
    },
    $pow(right, {test}={}) {
        return right**test[0]===test[1] ? right : undefined
    },

/*
    $$if(right, {test}={}) {
        return right===test[0] ? test[1] : test[2]
    },
    $$case(right, {test}={}) {
        const dflt = test.length/2!==0 ? test.pop() : undefined,
            pair = () => test.length>0 ? [test.shift(), test.shift()] : undefined;
        let next;
        while(next=pair()) {
            if(next[0]===right) return next[1];
        }
    },
    $$concat(right, {test}={}) {
        return Array.isArray(test) && Array.isArray(right) ? right.concat(test) : right + test;
    },
    $$join(right, {test}={}) {
        right = Array.isArray(right) ? right : [right];
        return right.join(test)
    },
    $$slice(right, {test}={}) {
        return Array.isArray(test) && Array.isArray(right) ? right.slice(...test) : typeof(right)==="string" ? right.substring(...test) : undefined;
    },
    $$substring(right, {test}={}) {
        return typeof(right)==="string" ? right.substring(...test) : undefined;
    },
    $$replace(right, {test}={}) {
        return typeof(right)==="string" ? right.replace(...test) : undefined;
    },
    $$split(right, {test}={}) {

    },
    $$trim(right, {test}={}) {

    },
    $$padStart(right, {test}={}) {

    },
    $$add(right, {test}={}) {
        return typeof(right)==="number" ? right+test : undefined;
    },
    $$subtract(right, {test}={}) {
        return  typeof(right)==="number" ? right-test : undefined;
    },
    $$multiply(right, {test}={}) {
        return  typeof(right)==="number" ? right*test : undefined;
    },
    $$divide(right, {test}={}) {
        return  typeof(right)==="number" ? right/test : undefined;
    },
    $$mod(right, {test}={}) {
        return  typeof(right)==="number" ? right%test : undefined
    },
    $$pow(right, {test}={}) {
        return  typeof(right)==="number" ? right**test : undefined;
    },
    ...["abs", "ceil", "floor", "round", "sign", "sqrt", "trunc","cos","sin","tan","acos","asin","atan","atan2","exp","log","max","min","random"].reduce((acc,fn) => {
        acc["$$"+fn] = (right, {test}) => typeof(right)==="number" ? Math[fn](right) : undefined;
        return acc;
    },{})
*/
}

const functionalOperators:{[key:string]:CompoundOperator} = Object.entries(operators).reduce((operators:{[key:string]:CompoundOperator},[key,f]) => {
    operators[key] = function(test:any) {
        let join:boolean = false;
        return (left:any,right:any):any => {
            return join ? f(left,right) : f(left,{test}); // join not yet implemented
        }
    }
    operators.$and = (...tests) => {
        const op:CompoundOperator = (left,right):any => {
            op.count = 0;
            op.possibleCount = tests.length;
            for(const test of tests) {
                const result = typeof(test)==="function" ? test(left,right) : (test===left ? test : undefined);
                if(result==undefined) {
                    op.count = 0;
                    break;
                }
                op.count += test ? test.count||1 : 1;
            }
            return op.count > 0 ? true : undefined;
        };
        return op;
    }
    operators.$or = (...tests) => {
        const op:CompoundOperator = (left,right):any => {
            op.count = 0;
            op.possibleCount = 1;
            for(const test of tests) {
                const result = typeof(test)==="function" ? test(left,right) : (test===left ? test : undefined);
                if(result!==undefined) {
                    op.count += test ? test.count||1 : 1;
                    break;
                }
            }
            return op.count > 0 ? true : undefined;
        }
        return op;
    }
    operators.$ior = (...tests) => {
        const op:CompoundOperator = (left,right) : any => {
            op.count = 0;
            op.possibleCount = tests.length;
            for(const test of tests) {
                const result = typeof(test)==="function" ? test(left,right) : (test===left ? test : undefined);
                if(result!==undefined) {
                    op.count += test ? test.count||1 : 1;
                }
            }
            return op.count > 0 ? true : undefined;
        }
        return op;
    }
    operators.$not = (...tests) => {
        const op:CompoundOperator = (left,right):any => {
            op.count = 0;
            op.possibleCount = tests.length;
            for(const test of tests) {
                const result = typeof(test)==="function" ? test(left,right) : (test===left ? test : undefined);
                if(result!==undefined) {
                    op.count = 0;
                    break;
                }
                op.count += test ? test.count||1 : 1;
            }
            return op.count > 0 ? true : undefined;
        }
        return op;
    }
    return operators;
},{});

//export {functionalOperators as default, functionalOperators as operators, DONE};
export {functionalOperators as default,functionalOperators as operators,operators as rawOperators,DONE}
