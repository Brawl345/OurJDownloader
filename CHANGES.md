## v2.0.4

* Fix session disconnects for real: the server answers dead sessions with `AUTH_FAILED` (not `TOKEN_INVALID`), which bypassed the entire recovery logic - now recovered with an automatic re-login

## v2.0.3

* Hopefully fix session disconnects again

## v2.0.2

* Fix session disconnects again
* Fix delete button functionality

## v2.0.1

* Fix session disconnects

## v2.0.0

* Rewrite with Vue
* Modernize design

## v1.0.0

* Initial release
