;; GHVToken.clar
;; GreenHarvest Value Token (GHV) - Fungible token for carbon sequestration rewards
;; Implements SIP-010 standard with additional features for carbon credit tracking
;; Features: Multi-minter support, pause functionality, mint records with metadata,
;; admin controls, burn with verification, token metadata URI

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-PAUSED (err u101))
(define-constant ERR-INVALID-AMOUNT (err u102))
(define-constant ERR-INVALID-RECIPIENT (err u103))
(define-constant ERR-INVALID-MINTER (err u104))
(define-constant ERR-ALREADY-REGISTERED (err u105))
(define-constant ERR-METADATA-TOO-LONG (err u106))
(define-constant ERR-INSUFFICIENT-BALANCE (err u107))
(define-constant ERR-INVALID-URI (err u108))
(define-constant ERR-NOT-OWNER (err u109))
(define-constant MAX-METADATA-LEN u500)
(define-constant TOKEN-NAME "GreenHarvestValue")
(define-constant TOKEN-SYMBOL "GHV")
(define-constant TOKEN-DECIMALS u6) ;; 6 decimals for precision in carbon credits
(define-constant MAX-URI-LEN u256)

;; Data Variables
(define-data-var contract-paused bool false)
(define-data-var contract-admin principal CONTRACT-OWNER)
(define-data-var token-uri (optional (string-utf8 MAX-URI-LEN)) none)
(define-data-var mint-counter uint u0)

;; Data Maps
(define-map minters principal bool)
(define-map balances principal uint)
(define-map mint-records
  uint ;; mint-id
  {
    amount: uint,
    recipient: principal,
    metadata: (string-utf8 MAX-METADATA-LEN), ;; e.g., "1.5 tons CO2 from farm X"
    block-height: uint,
    minter: principal
  }
)

;; Fungible Token Definition (unlimited supply for rewards)
(define-fungible-token ghv)

;; Read-Only Functions (SIP-010 compliant)
(define-read-only (get-name)
  (ok TOKEN-NAME)
)

(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance ghv account))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply ghv))
)

(define-read-only (get-token-uri)
  (ok (var-get token-uri))
)

(define-read-only (is-minter (account principal))
  (default-to false (map-get? minters account))
)

(define-read-only (is-paused)
  (var-get contract-paused)
)

(define-read-only (get-admin)
  (var-get contract-admin)
)

(define-read-only (get-mint-record (mint-id uint))
  (map-get? mint-records mint-id)
)

(define-read-only (get-mint-counter)
  (var-get mint-counter)
)

;; Private Functions
(define-private (is-admin (caller principal))
  (is-eq caller (var-get contract-admin))
)

(define-private (is-contract-owner (caller principal))
  (is-eq caller CONTRACT-OWNER)
)

;; Public Functions
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (or (is-admin tx-sender) (is-contract-owner tx-sender)) ERR-UNAUTHORIZED)
    (ok (var-set contract-admin new-admin))
  )
)

(define-public (pause-contract)
  (begin
    (asserts! (is-admin tx-sender) ERR-UNAUTHORIZED)
    (ok (var-set contract-paused true))
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-admin tx-sender) ERR-UNAUTHORIZED)
    (ok (var-set contract-paused false))
  )
)

(define-public (set-token-uri (new-uri (string-utf8 MAX-URI-LEN)))
  (begin
    (asserts! (is-admin tx-sender) ERR-UNAUTHORIZED)
    (asserts! (<= (len new-uri) MAX-URI-LEN) ERR-INVALID-URI)
    (ok (var-set token-uri (some new-uri)))
  )
)

(define-public (add-minter (new-minter principal))
  (begin
    (asserts! (is-admin tx-sender) ERR-UNAUTHORIZED)
    (asserts! (is-none (map-get? minters new-minter)) ERR-ALREADY-REGISTERED)
    (ok (map-set minters new-minter true))
  )
)

(define-public (remove-minter (minter principal))
  (begin
    (asserts! (is-admin tx-sender) ERR-UNAUTHORIZED)
    (ok (map-set minters minter false))
  )
)

(define-public (mint (amount uint) (recipient principal) (metadata (string-utf8 MAX-METADATA-LEN)))
  (let
    (
      (current-counter (var-get mint-counter))
      (new-counter (+ current-counter u1))
    )
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-minter tx-sender) ERR-INVALID-MINTER)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (not (is-eq recipient CONTRACT-OWNER)) ERR-INVALID-RECIPIENT) ;; Prevent mint to owner for safety
    (asserts! (<= (len metadata) MAX-METADATA-LEN) ERR-METADATA-TOO-LONG)
    (map-set mint-records new-counter
      {
        amount: amount,
        recipient: recipient,
        metadata: metadata,
        block-height: block-height,
        minter: tx-sender
      }
    )
    (var-set mint-counter new-counter)
    (try! (ft-mint? ghv amount recipient))
    (ok new-counter) ;; Return mint-id
  )
)

(define-public (transfer (amount uint) (sender principal) (recipient principal))
  (begin
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq tx-sender sender) ERR-UNAUTHORIZED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (not (is-eq recipient CONTRACT-OWNER)) ERR-INVALID-RECIPIENT)
    (asserts! (>= (ft-get-balance ghv sender) amount) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-transfer? ghv amount sender recipient))
    (ok true)
  )
)

(define-public (burn (amount uint))
  (begin
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (>= (ft-get-balance ghv tx-sender) amount) ERR-INSUFFICIENT-BALANCE)
    (try! (ft-burn? ghv amount tx-sender))
    (ok true)
  )
)

;; Additional Sophisticated Features
;; Batch Mint for efficiency in reward distributions
(define-public (batch-mint (recipients (list 100 {recipient: principal, amount: uint, metadata: (string-utf8 MAX-METADATA-LEN)})))
  (let
    (
      (results (fold batch-mint-iter recipients (ok u0)))
    )
    results
  )
)

(define-private (batch-mint-iter (entry {recipient: principal, amount: uint, metadata: (string-utf8 MAX-METADATA-LEN)}) (previous (response uint uint)))
  (match previous
    count
    (begin
      (try! (mint (get amount entry) (get recipient entry) (get metadata entry)))
      (ok (+ count u1))
    )
    error (err error)
  )
)

;; Verify Mint Record Ownership
(define-public (verify-mint-ownership (mint-id uint) (owner principal))
  (match (map-get? mint-records mint-id)
    record
    (if (is-eq (get recipient record) owner)
      (ok true)
      ERR-NOT-OWNER
    )
    ERR-UNAUTHORIZED
  )
)

;; Initialization
(map-set minters CONTRACT-OWNER true) ;; Owner is initial minter