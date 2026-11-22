'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../rm017-signup.css'),'utf8');

test('mobile selection has a single green border without gold outer ring',()=>{
 assert.match(css,/\.type-card:has\(input:checked\)\{[^}]*border-color:#13906a;[^}]*box-shadow:none\}/);
 assert.doesNotMatch(css,/\.type-card:focus-within\{[^}]*outline:(?!none)/);
 assert.match(css,/\.type-card:focus-within\{outline:none\}/);
});
test('keyboard focus remains visible without a second outer border',()=>{
 assert.match(css,/\.type-card:has\(input:focus-visible\) \.type-copy strong\{[^}]*text-decoration:underline/);
 assert.match(css,/\.type-card:has\(input:focus-visible\)\{border-color:#087f5b\}/);
});
