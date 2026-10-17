import{r as T,_ as v,C as k,a as C,E as ie,o as Fe,F as re,L as $e,g as q,b as se,c as oe,v as ce,d as G,e as ue,f as Me,h as Ne,i as xe}from"./index.esm-Cnd9fYO5.js";import{getAuth as qe,onAuthStateChanged as Le,getRedirectResult as je,deleteUser as W,sendPasswordResetEmail as Ve,signOut as _,GoogleAuthProvider as Ue,signInWithPopup as Be,signInWithRedirect as ze,signInWithEmailAndPassword as H,reload as K,sendEmailVerification as D,createUserWithEmailAndPassword as Ge}from"./index.esm-CS9K6r93.js";import{A as d,e as O,p as We,s as He}from"./stats-hwt8lEU3.js";var Ke="firebase",Ye="12.19.0";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */T(Ke,Ye,"app");const le="@firebase/installations",L="0.6.24";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const de=1e4,fe=`w:${L}`,pe="FIS_v2",Je="https://firebaseinstallations.googleapis.com/v1",Xe=60*60*1e3,Ze="installations",Qe="Installations";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const et={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."},w=new ie(Ze,Qe,et);function he(e){return e instanceof re&&e.code.includes("request-failed")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function me({projectId:e}){return`${Je}/projects/${e}/installations`}function ge(e){return{token:e.token,requestStatus:2,expiresIn:nt(e.expiresIn),creationTime:Date.now()}}async function we(e,t){const r=(await t.json()).error;return w.create("request-failed",{requestName:e,serverCode:r.code,serverMessage:r.message,serverStatus:r.status})}function ye({apiKey:e}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e})}function tt(e,{refreshToken:t}){const n=ye(e);return n.append("Authorization",at(t)),n}async function Ie(e){const t=await e();return t.status>=500&&t.status<600?e():t}function nt(e){return Number(e.replace("s","000"))}function at(e){return`${pe} ${e}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function it({appConfig:e,heartbeatServiceProvider:t},{fid:n}){const r=me(e),a=ye(e),i=t.getImmediate({optional:!0});if(i){const u=await i.getHeartbeatsHeader();u&&a.append("x-firebase-client",u)}const s={fid:n,authVersion:pe,appId:e.appId,sdkVersion:fe},o={method:"POST",headers:a,body:JSON.stringify(s)},c=await Ie(()=>fetch(r,o));if(c.ok){const u=await c.json();return{fid:u.fid||n,registrationStatus:2,refreshToken:u.refreshToken,authToken:ge(u.authToken)}}else throw await we("Create Installation",c)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function be(e){return new Promise(t=>{setTimeout(t,e)})}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function rt(e){return btoa(String.fromCharCode(...e)).replace(/\+/g,"-").replace(/\//g,"_")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const st=/^[cdef][\w-]{21}$/,x="";function ot(){try{const e=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(e),e[0]=112+e[0]%16;const n=ct(e);return st.test(n)?n:x}catch{return x}}function ct(e){return rt(e).substr(0,22)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function P(e){return`${e.appName}!${e.appId}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Te=new Map;function Ae(e,t){const n=P(e);ve(n,t),ut(n,t)}function ve(e,t){const n=Te.get(e);if(n)for(const r of n)r(t)}function ut(e,t){const n=lt();n&&n.postMessage({key:e,fid:t}),dt()}let g=null;function lt(){return!g&&"BroadcastChannel"in self&&(g=new BroadcastChannel("[Firebase] FID Change"),g.onmessage=e=>{ve(e.data.key,e.data.fid)}),g}function dt(){Te.size===0&&g&&(g.close(),g=null)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ft="firebase-installations-database",pt=1,y="firebase-installations-store";let F=null;function j(){return F||(F=Fe(ft,pt,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(y)}}})),F}async function S(e,t){const n=P(e),a=(await j()).transaction(y,"readwrite"),i=a.objectStore(y),s=await i.get(n);return await i.put(t,n),await a.done,(!s||s.fid!==t.fid)&&Ae(e,t.fid),t}async function ke(e){const t=P(e),r=(await j()).transaction(y,"readwrite");await r.objectStore(y).delete(t),await r.done}async function R(e,t){const n=P(e),a=(await j()).transaction(y,"readwrite"),i=a.objectStore(y),s=await i.get(n),o=t(s);return o===void 0?await i.delete(n):await i.put(o,n),await a.done,o&&(!s||s.fid!==o.fid)&&Ae(e,o.fid),o}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function V(e){let t;const n=await R(e.appConfig,r=>{const a=ht(r),i=mt(e,a);return t=i.registrationPromise,i.installationEntry});return n.fid===x?{installationEntry:await t}:{installationEntry:n,registrationPromise:t}}function ht(e){const t=e||{fid:ot(),registrationStatus:0};return Se(t)}function mt(e,t){if(t.registrationStatus===0){if(!navigator.onLine){const a=Promise.reject(w.create("app-offline"));return{installationEntry:t,registrationPromise:a}}const n={fid:t.fid,registrationStatus:1,registrationTime:Date.now()},r=gt(e,n);return{installationEntry:n,registrationPromise:r}}else return t.registrationStatus===1?{installationEntry:t,registrationPromise:wt(e)}:{installationEntry:t}}async function gt(e,t){try{const n=await it(e,t);return S(e.appConfig,n)}catch(n){throw he(n)&&n.customData.serverCode===409?await ke(e.appConfig):await S(e.appConfig,{fid:t.fid,registrationStatus:0}),n}}async function wt(e){let t=await Y(e.appConfig);for(;t.registrationStatus===1;)await be(100),t=await Y(e.appConfig);if(t.registrationStatus===0){const{installationEntry:n,registrationPromise:r}=await V(e);return r||n}return t}function Y(e){return R(e,t=>{if(!t)throw w.create("installation-not-found");return Se(t)})}function Se(e){return yt(e)?{fid:e.fid,registrationStatus:0}:e}function yt(e){return e.registrationStatus===1&&e.registrationTime+de<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function It({appConfig:e,heartbeatServiceProvider:t},n){const r=bt(e,n),a=tt(e,n),i=t.getImmediate({optional:!0});if(i){const u=await i.getHeartbeatsHeader();u&&a.append("x-firebase-client",u)}const s={installation:{sdkVersion:fe,appId:e.appId}},o={method:"POST",headers:a,body:JSON.stringify(s)},c=await Ie(()=>fetch(r,o));if(c.ok){const u=await c.json();return ge(u)}else throw await we("Generate Auth Token",c)}function bt(e,{fid:t}){return`${me(e)}/${t}/authTokens:generate`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function U(e,t=!1){let n;const r=await R(e.appConfig,i=>{if(!Ee(i))throw w.create("not-registered");const s=i.authToken;if(!t&&vt(s))return i;if(s.requestStatus===1)return n=Tt(e,t),i;{if(!navigator.onLine)throw w.create("app-offline");const o=St(i);return n=At(e,o),o}});return n?await n:r.authToken}async function Tt(e,t){let n=await J(e.appConfig);for(;n.authToken.requestStatus===1;)await be(100),n=await J(e.appConfig);const r=n.authToken;return r.requestStatus===0?U(e,t):r}function J(e){return R(e,t=>{if(!Ee(t))throw w.create("not-registered");const n=t.authToken;return Et(n)?{...t,authToken:{requestStatus:0}}:t})}async function At(e,t){try{const n=await It(e,t),r={...t,authToken:n};return await S(e.appConfig,r),n}catch(n){if(he(n)&&(n.customData.serverCode===401||n.customData.serverCode===404))await ke(e.appConfig);else{const r={...t,authToken:{requestStatus:0}};await S(e.appConfig,r)}throw n}}function Ee(e){return e!==void 0&&e.registrationStatus===2}function vt(e){return e.requestStatus===2&&!kt(e)}function kt(e){const t=Date.now();return t<e.creationTime||e.creationTime+e.expiresIn<t+Xe}function St(e){const t={requestStatus:1,requestTime:Date.now()};return{...e,authToken:t}}function Et(e){return e.requestStatus===1&&e.requestTime+de<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ct(e){const t=e,{installationEntry:n,registrationPromise:r}=await V(t);return r?r.catch(console.error):U(t).catch(console.error),n.fid}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Pt(e,t=!1){const n=e;return await Rt(n),(await U(n,t)).token}async function Rt(e){const{registrationPromise:t}=await V(e);t&&await t}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function _t(e){if(!e||!e.options)throw $("App Configuration");if(!e.name)throw $("App Name");const t=["projectId","apiKey","appId"];for(const n of t)if(!e.options[n])throw $(n);return{appName:e.name,projectId:e.options.projectId,apiKey:e.options.apiKey,appId:e.options.appId}}function $(e){return w.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ce="installations",Dt="installations-internal",Ot=e=>{const t=e.getProvider("app").getImmediate(),n=_t(t),r=C(t,"heartbeat");return{app:t,appConfig:n,heartbeatServiceProvider:r,_delete:()=>Promise.resolve()}},Ft=e=>{const t=e.getProvider("app").getImmediate(),n=C(t,Ce).getImmediate();return{getId:()=>Ct(n),getToken:a=>Pt(n,a)}};function $t(){v(new k(Ce,Ot,"PUBLIC")),v(new k(Dt,Ft,"PRIVATE"))}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */$t();T(le,L);T(le,L,"esm2020");/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const E="analytics",Mt="firebase_id",Nt="origin",xt=60*1e3,qt="https://firebase.googleapis.com/v1alpha/projects/-/apps/{app-id}/webConfig",B="https://www.googletagmanager.com/gtag/js";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const l=new $e("@firebase/analytics");/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Lt={"already-exists":"A Firebase Analytics instance with the appId {$id}  already exists. Only one Firebase Analytics instance can be created for each appId.","already-initialized":"initializeAnalytics() cannot be called again with different options than those it was initially called with. It can be called again with the same options to return the existing instance, or getAnalytics() can be used to get a reference to the already-initialized instance.","already-initialized-settings":"Firebase Analytics has already been initialized.settings() must be called before initializing any Analytics instanceor it will have no effect.","interop-component-reg-failed":"Firebase Analytics Interop Component failed to instantiate: {$reason}","invalid-analytics-context":"Firebase Analytics is not supported in this environment. Wrap initialization of analytics in analytics.isSupported() to prevent initialization in unsupported environments. Details: {$errorInfo}","indexeddb-unavailable":"IndexedDB unavailable or restricted in this environment. Wrap initialization of analytics in analytics.isSupported() to prevent initialization in unsupported environments. Details: {$errorInfo}","fetch-throttle":"The config fetch request timed out while in an exponential backoff state. Unix timestamp in milliseconds when fetch request throttling ends: {$throttleEndTimeMillis}.","config-fetch-failed":"Dynamic config fetch failed: [{$httpStatus}] {$responseMessage}","no-api-key":'The "apiKey" field is empty in the local Firebase config. Firebase Analytics requires this field tocontain a valid API key.',"no-app-id":'The "appId" field is empty in the local Firebase config. Firebase Analytics requires this field tocontain a valid app ID.',"no-client-id":'The "client_id" field is empty.',"invalid-gtag-resource":"Trusted Types detected an invalid gtag resource: {$gtagURL}."},f=new ie("analytics","Analytics",Lt);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function jt(e){if(!e.startsWith(B)){const t=f.create("invalid-gtag-resource",{gtagURL:e});return l.warn(t.message),""}return e}function Pe(e){return Promise.all(e.map(t=>t.catch(n=>n)))}function Vt(e,t){let n;return window.trustedTypes&&(n=window.trustedTypes.createPolicy(e,t)),n}function Ut(e,t){const n=Vt("firebase-js-sdk-policy",{createScriptURL:jt}),r=document.createElement("script"),a=`${B}?l=${e}&id=${t}`;r.src=n?n==null?void 0:n.createScriptURL(a):a,r.async=!0,document.head.appendChild(r)}function Bt(e){let t=[];return Array.isArray(window[e])?t=window[e]:window[e]=t,t}async function zt(e,t,n,r,a,i){const s=r[a];try{if(s)await t[s];else{const c=(await Pe(n)).find(u=>u.measurementId===a);c&&await t[c.appId]}}catch(o){l.error(o)}e("config",a,i)}async function Gt(e,t,n,r,a){try{let i=[];if(a&&a.send_to){let s=a.send_to;Array.isArray(s)||(s=[s]);const o=await Pe(n);for(const c of s){const u=o.find(h=>h.measurementId===c),p=u&&t[u.appId];if(p)i.push(p);else{i=[];break}}}i.length===0&&(i=Object.values(t)),await Promise.all(i),e("event",r,a||{})}catch(i){l.error(i)}}function Wt(e,t,n,r){async function a(i,...s){try{if(i==="event"){const[o,c]=s;await Gt(e,t,n,o,c)}else if(i==="config"){const[o,c]=s;await zt(e,t,n,r,o,c)}else if(i==="consent"){const[o,c]=s;e("consent",o,c)}else if(i==="get"){const[o,c,u]=s;e("get",o,c,u)}else if(i==="set"){const[o]=s;e("set",o)}else e(i,...s)}catch(o){l.error(o)}}return a}function Ht(e,t,n,r,a){let i=function(...s){window[r].push(arguments)};return window[a]&&typeof window[a]=="function"&&(i=window[a]),window[a]=Wt(i,e,t,n),{gtagCore:i,wrappedGtag:window[a]}}function Kt(e){const t=window.document.getElementsByTagName("script");for(const n of Object.values(t))if(n.src&&n.src.includes(B)&&n.src.includes(e))return n;return null}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Yt=30,Jt=1e3;class Xt{constructor(t={},n=Jt){this.throttleMetadata=t,this.intervalMillis=n}getThrottleMetadata(t){return this.throttleMetadata[t]}setThrottleMetadata(t,n){this.throttleMetadata[t]=n}deleteThrottleMetadata(t){delete this.throttleMetadata[t]}}const Re=new Xt;function Zt(e){return new Headers({Accept:"application/json","x-goog-api-key":e})}async function Qt(e){var s;const{appId:t,apiKey:n}=e,r={method:"GET",headers:Zt(n)},a=qt.replace("{app-id}",t),i=await fetch(a,r);if(i.status!==200&&i.status!==304){let o="";try{const c=await i.json();(s=c.error)!=null&&s.message&&(o=c.error.message)}catch{}throw f.create("config-fetch-failed",{httpStatus:i.status,responseMessage:o})}return i.json()}async function en(e,t=Re,n){const{appId:r,apiKey:a,measurementId:i}=e.options;if(!r)throw f.create("no-app-id");if(!a){if(i)return{measurementId:i,appId:r};throw f.create("no-api-key")}const s=t.getThrottleMetadata(r)||{backoffCount:0,throttleEndTimeMillis:Date.now()},o=new an;return setTimeout(async()=>{o.abort()},xt),_e({appId:r,apiKey:a,measurementId:i},s,o,t)}async function _e(e,{throttleEndTimeMillis:t,backoffCount:n},r,a=Re){var o;const{appId:i,measurementId:s}=e;try{await tn(r,t)}catch(c){if(s)return l.warn(`Timed out fetching this Firebase app's measurement ID from the server. Falling back to the measurement ID ${s} provided in the "measurementId" field in the local Firebase config. [${c==null?void 0:c.message}]`),{appId:i,measurementId:s};throw c}try{const c=await Qt(e);return a.deleteThrottleMetadata(i),c}catch(c){const u=c;if(!nn(u)){if(a.deleteThrottleMetadata(i),s)return l.warn(`Failed to fetch this Firebase app's measurement ID from the server. Falling back to the measurement ID ${s} provided in the "measurementId" field in the local Firebase config. [${u==null?void 0:u.message}]`),{appId:i,measurementId:s};throw c}const p=Number((o=u==null?void 0:u.customData)==null?void 0:o.httpStatus)===503?G(n,a.intervalMillis,Yt):G(n,a.intervalMillis),h={throttleEndTimeMillis:Date.now()+p,backoffCount:n+1};return a.setThrottleMetadata(i,h),l.debug(`Calling attemptFetch again in ${p} millis`),_e(e,h,r,a)}}function tn(e,t){return new Promise((n,r)=>{const a=Math.max(t-Date.now(),0),i=setTimeout(n,a);e.addEventListener(()=>{clearTimeout(i),r(f.create("fetch-throttle",{throttleEndTimeMillis:t}))})})}function nn(e){if(!(e instanceof re)||!e.customData)return!1;const t=Number(e.customData.httpStatus);return t===429||t===500||t===503||t===504}class an{constructor(){this.listeners=[]}addEventListener(t){this.listeners.push(t)}abort(){this.listeners.forEach(t=>t())}}async function rn(e,t,n,r,a){if(a&&a.global){e("event",n,r);return}else{const i=await t,s={...r,send_to:i};e("event",n,s)}}async function sn(e,t,n,r){if(r&&r.global){const a={};for(const i of Object.keys(n))a[`user_properties.${i}`]=n[i];return e("set",a),Promise.resolve()}else{const a=await t;e("config",a,{update:!0,user_properties:n})}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function on(){if(oe())try{await ce()}catch(e){return l.warn(f.create("indexeddb-unavailable",{errorInfo:e==null?void 0:e.toString()}).message),!1}else return l.warn(f.create("indexeddb-unavailable",{errorInfo:"IndexedDB is not available in this environment."}).message),!1;return!0}async function cn(e,t,n,r,a,i,s){const o=en(e);o.then(m=>{n[m.measurementId]=m.appId,e.options.measurementId&&m.measurementId!==e.options.measurementId&&l.warn(`The measurement ID in the local Firebase config (${e.options.measurementId}) does not match the measurement ID fetched from the server (${m.measurementId}). To ensure analytics events are always sent to the correct Analytics property, update the measurement ID field in the local config or remove it from the local config.`)}).catch(m=>l.error(m)),t.push(o);const c=on().then(m=>{if(m)return r.getId()}),[u,p]=await Promise.all([o,c]);Kt(i)||Ut(i,u.measurementId),a("js",new Date);const h=(s==null?void 0:s.config)??{};return h[Nt]="firebase",h.update=!0,p!=null&&(h[Mt]=p),a("config",u.measurementId,h),u.measurementId}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class un{constructor(t){this.app=t}_delete(){return delete b[this.app.options.appId],Promise.resolve()}}let b={},X=[];const Z={};let M="dataLayer",ln="gtag",Q,z,ee=!1;function dn(){const e=[];if(se()&&e.push("This is a browser extension environment."),ue()||e.push("Cookies are not available."),e.length>0){const t=e.map((r,a)=>`(${a+1}) ${r}`).join(" "),n=f.create("invalid-analytics-context",{errorInfo:t});l.warn(n.message)}}function fn(e,t,n){dn();const r=e.options.appId;if(!r)throw f.create("no-app-id");if(!e.options.apiKey)if(e.options.measurementId)l.warn(`The "apiKey" field is empty in the local Firebase config. This is needed to fetch the latest measurement ID for this Firebase app. Falling back to the measurement ID ${e.options.measurementId} provided in the "measurementId" field in the local Firebase config.`);else throw f.create("no-api-key");if(b[r]!=null)throw f.create("already-exists",{id:r});if(!ee){Bt(M);const{wrappedGtag:i,gtagCore:s}=Ht(b,X,Z,M,ln);z=i,Q=s,ee=!0}return b[r]=cn(e,X,Z,t,Q,M,n),new un(e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function pn(e=Me()){e=q(e);const t=C(e,E);return t.isInitialized()?t.getImmediate():hn(e)}function hn(e,t={}){const n=C(e,E);if(n.isInitialized()){const a=n.getImmediate();if(Ne(t,n.getOptions()))return a;throw f.create("already-initialized")}return n.initialize({options:t})}async function mn(){if(se()||!ue()||!oe())return!1;try{return await ce()}catch{return!1}}function gn(e,t,n){e=q(e),sn(z,b[e.app.options.appId],t,n).catch(r=>l.error(r))}function De(e,t,n,r){e=q(e),rn(z,b[e.app.options.appId],t,n,r).catch(a=>l.error(a))}const te="@firebase/analytics",ne="0.10.25";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function wn(){v(new k(E,(t,{options:n})=>{const r=t.getProvider("app").getImmediate(),a=t.getProvider("installations-internal").getImmediate();return fn(r,a,n)},"PUBLIC")),v(new k("analytics-internal",e,"PRIVATE")),T(te,ne),T(te,ne,"esm2020");function e(t){try{const n=t.getProvider(E).getImmediate();return{logEvent:(r,a,i)=>De(n,r,a,i),setUserProperties:(r,a)=>gn(n,r,a)}}catch(n){throw f.create("interop-component-reg-failed",{reason:n})}}}wn();const A={apiKey:"AIzaSyCIznaxc92v2b0s_luJkyjq8EMVgH-FWHk",authDomain:"ja-rescue.firebaseapp.com",projectId:"ja-rescue",storageBucket:"ja-rescue.firebasestorage.app",messagingSenderId:"787109971207",appId:"1:787109971207:web:2d68223460c10c468271a2",measurementId:"G-XWS97ZC745"},ae="auth.9jarescue.app";async function yn(){if(!/(^|\.)9jarescue\.app$/.test(location.hostname))return A.authDomain;try{return await Promise.race([fetch(`https://${ae}/__/auth/handler.js`,{mode:"no-cors",cache:"no-store"}).then(()=>!0),new Promise(t=>setTimeout(()=>t(!1),2500))])?ae:A.authDomain}catch{return A.authDomain}}const Oe="9ja.online.seen";function I(e){const t=(e==null?void 0:e.code)||"",n={"auth/email-already-in-use":["email-in-use","An account already uses this email. Sign in instead."],"auth/invalid-credential":["wrong","Email or password is incorrect."],"auth/wrong-password":["wrong","Email or password is incorrect."],"auth/user-not-found":["wrong","Email or password is incorrect."],"auth/invalid-email":["invalid","Enter a valid email address, like name@example.com."],"auth/weak-password":["invalid","Choose a stronger password."],"auth/too-many-requests":["locked","Too many attempts. Wait a few minutes, then try again."],"auth/network-request-failed":["network","No connection to the account service. Check your internet and try again."],"auth/user-disabled":["disabled","This account has been turned off."],"auth/operation-not-allowed":["setup","This way of signing in is not turned on for this game yet."],"auth/popup-closed-by-user":["cancelled",""],"auth/cancelled-popup-request":["cancelled",""],"auth/user-cancelled":["cancelled",""],"auth/unauthorized-domain":["setup","Google sign-in is not allowed on this web address yet (Firebase authorized domains)."],"auth/account-exists-with-different-credential":["other","This email already has an account. Sign in with your email and password."]}[t];return n?new d(n[0],n[1]):new d("other",`Something went wrong (${t||(e==null?void 0:e.message)||"unknown"}). Try again.`)}const N=()=>{try{localStorage.setItem(Oe,"1")}catch{}};async function An(){const e=xe({...A,authDomain:await yn()}),t=qe(e);t.useDeviceLanguage(),/(^|\.)9jarescue\.app$/.test(location.hostname)&&mn().then(a=>{if(a){const i=pn(e);He((s,o)=>De(i,s,o))}}).catch(()=>{}),await new Promise(a=>{const i=Le(t,()=>{i(),a()})}),await je(t).catch(()=>{});const n=()=>t.currentUser,r=a=>({uid:a.uid,email:a.email});return{provider:"firebase",app:e,knownDevice(){try{return!!localStorage.getItem(Oe)}catch{return!1}},current(){const a=n();return a&&a.emailVerified?r(a):null},async signUp(a,i){const s=O(a)||We(i);if(s)throw new d("invalid",s);try{const{user:o}=await Ge(t,a.trim(),i);return await D(o),N(),{email:o.email}}catch(o){if((o==null?void 0:o.code)==="auth/email-already-in-use")try{const{user:c}=await H(t,a.trim(),i);if(!c.emailVerified)return await D(c),{email:c.email};await _(t)}catch{}throw I(o)}},async resendVerification(){const a=n();if(!a)throw new d("no-account","Sign in again to send a new email.");if(await K(a).catch(()=>{}),a.emailVerified)return{already:!0};try{await D(a)}catch(i){throw I(i)}return{sent:!0}},async checkVerified(){const a=n();if(!a)throw new d("no-account","Sign in to continue.");try{await K(a)}catch(i){throw I(i)}if(!a.emailVerified)throw new d("not-verified","Your email is not verified yet. Open the link in the email we sent (check spam too), then try again.");return await a.getIdToken(!0).catch(()=>{}),r(a)},verifyLink(){throw new d("link-invalid","Open the link from your email to verify.")},async changeEmail(){const a=n();a&&!a.emailVerified&&await W(a).catch(()=>_(t))},async signIn(a,i){const s=O(a);if(s)throw new d("invalid",s);if(!i)throw new d("invalid","Enter your password.");let o;try{({user:o}=await H(t,a.trim(),i))}catch(c){throw I(c)}if(N(),!o.emailVerified)throw new d("unverified","Verify your email to sign in.");return r(o)},canGoogle:!0,async signInWithGoogle(){const a=new Ue;a.setCustomParameters({prompt:"select_account"});try{const{user:i}=await Be(t,a);return N(),r(i)}catch(i){if((i==null?void 0:i.code)==="auth/popup-blocked"||(i==null?void 0:i.code)==="auth/operation-not-supported-in-this-environment")return await ze(t,a),new Promise(()=>{});throw I(i)}},signOut(){_(t).catch(()=>{})},async requestReset(a){const i=O(a);if(i)throw new d("invalid",i);try{await Ve(t,a.trim())}catch(s){if((s==null?void 0:s.code)!=="auth/user-not-found"){const o=I(s);if(o.code==="network"||o.code==="locked")throw o}}return{sent:!0}},checkResetLink(){throw new d("link-invalid","Open the link from your email to choose a new password.")},async resetPassword(){throw new d("link-invalid","Open the link from your email to choose a new password.")},latestMail(){return null},_uid(){var a;return((a=n())==null?void 0:a.uid)??null},async _deleteMe(){const a=n();a&&await W(a)}}}export{A as CONFIG,An as createFirebaseAuth,yn as pickAuthDomain};
