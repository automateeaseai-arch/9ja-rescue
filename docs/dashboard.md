# Owner's dashboard (15 Oct)

Page: **https://9jarescue.app/admin.html** (sign in with the owner's Google account).
Shows players online now (every 10 s; in a mission or in the menus), today's visitors,
missions started and completed and new accounts, visitors over the last 7 days, and
all-time totals. Built from small anonymous records the game writes (`src/stats.js`);
the page is `admin.html` + `src/admin.js` + `src/admin.css` (left out of the claude.ai copy).

## Firestore rules (Firebase console → Firestore Database → Rules)
Replace `OWNER_EMAIL` with the owner's Google address (kept out of this repo).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner() {
      return request.auth != null && request.auth.token.email == 'OWNER_EMAIL'
        && request.auth.token.email_verified == true;
    }
    function stamp() { return request.resource.data.t == request.time; }
    function day() { return request.resource.data.day is string && request.resource.data.day.size() == 10; }
    function dayRecord() { return request.resource.data.keys().hasOnly(['day', 't']) && day() && stamp(); }
    function missionRecord() {
      return request.resource.data.keys().hasOnly(['day', 't', 'site']) && day() && stamp()
        && request.resource.data.site in ['camp', 'compound', ''];
    }
    match /players/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /rankings/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['name', 'mp', 'missions', 'captives', 'updated'])
        && request.resource.data.name is string && request.resource.data.name.size() <= 24
        && request.resource.data.mp is int && request.resource.data.mp >= 0;
    }
    match /live/{tab} {
      allow read: if isOwner();
      allow create, update: if tab.size() <= 20 && request.resource.data.keys().hasOnly(['t', 'where'])
        && request.resource.data.where in ['menu', 'mission'] && stamp();
      allow delete: if true;
    }
    match /visitors/{id} { allow read: if isOwner(); allow create: if id.size() <= 20 && dayRecord(); }
    match /visits/{id} { allow read: if isOwner(); allow create: if id.size() <= 32 && dayRecord(); }
    match /accounts/{uid} {
      allow read: if isOwner();
      allow create: if request.auth != null && request.auth.uid == uid && dayRecord();
    }
    match /missionStarts/{id} { allow read: if isOwner(); allow create: if missionRecord(); }
    match /missionWins/{id} { allow read: if isOwner(); allow create: if missionRecord(); }
  }
}
```
