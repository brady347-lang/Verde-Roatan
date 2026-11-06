# Fixed debug signing key

Every CI build used to create a brand-new Android project, so each APK got a different random debug
signature and Android refused to install it over the previous one. The workflow now installs
`verde-debug.keystore` as the debug key before building, so every build is signed the same way and
updates install in place.

This is a DEBUG key (standard Android debug password) and is intentionally not secret. Do NOT use it
for Google Play. A store release needs its own private key kept in GitHub secrets.
