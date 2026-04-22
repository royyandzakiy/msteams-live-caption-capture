## Bug Backlog
- currently only stores 400~ captured messages. probably bcs in msteams, after 400 messages, it removes old messages. fix logic such that it retains old captured messages. suspect is that it rewrites the whole temporary stored messages everytime, rather it should just rewrite the last capture (of 10 sec interval), and keep the old ones as is

## Feature
- reimplement message processing & storing as C++ WASM backend (keep everything else intact)
    - JS kept for DOM & callbacks, passes data to WASM APIs generated