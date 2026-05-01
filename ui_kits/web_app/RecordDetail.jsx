// Record detail page — public view + owner decrypt.
//
// Public: anyone can land here with /record/:id. We show:
//   - The proof panel (all hashes + attester + signature).
//   - "Verify signature" → recovers the signer from the on-chain digest +
//     stored attesterSig, compares to record.attester. No network call to
//     the attester service is needed; it's pure cryptography.
//   - "Verify integrity" → fetches the ciphertext, hashes it, compares to
//     record.ciphertextHash. Inline-mode records can only be integrity-
//     checked on the device that sealed them (localStorage cache).
//
// Author: in addition to the above, "Decrypt & read" runs the wallet-signed
// HKDF flow and renders the decrypted transcript.

const RecordDetail = ({ id, go }) => {
  const wallet = useWallet();
  const toast  = useToast();

  const [record,   setRecord]   = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [verified, setVerified] = useState(null);     // null | true | false
  const [verifyMsg, setVerifyMsg] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [integrityMsg, setIntegrityMsg] = useState(null);
  const [envelope, setEnvelope] = useState(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptErr, setDecryptErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await window.NousContract.fetchRecord(Number(id));
        if (!cancelled) setRecord(r);
      } catch (err) {
        console.warn('fetchRecord failed', err);
        if (!cancelled) setRecord(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '80px 32px 96px' }}>
      <Card style={{ padding: 56, textAlign: 'center' }}>
        <div className="spin" style={{ width: 28, height: 28, border: '3px solid rgba(41,182,246,0.2)', borderTopColor: 'var(--sky-500)', borderRadius: '50%', margin: '0 auto' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginTop: 14 }}>Loading record #{id}…</p>
      </Card>
    </div>;
  }

  if (!record) {
    return <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '80px 32px 96px' }}>
      <button onClick={() => go('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--sky-600)', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, padding: 0 }}>
        <I name="arrow-left" size={14} /> Back to Explore
      </button>
      <Card style={{ padding: 56, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 6px 18px rgba(2,136,209,0.25)', margin: '0 auto 20px' }}>
          <I name="scroll-text" size={32} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: 0 }}>Record not found.</h3>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'var(--text-secondary)', margin: '8px 0 24px' }}>It may not be sealed yet, or the link is out of date.</p>
        <Button variant="primary" size="md" onClick={() => go('landing')}>Back to Explore <I name="arrow-right" size={16} /></Button>
      </Card>
    </div>;
  }

  const isOwner = wallet.address && record.author.toLowerCase() === wallet.address.toLowerCase();
  const sealedDate = new Date(record.sealedAt * 1000).toISOString();

  // Verify the attester signature offline using on-chain recordDigest +
  // ethers.verifyMessage. No call to the attester service.
  const verifySignature = async () => {
    try {
      const digest = await window.NousContract.computeRecordDigest({
        author:         record.author,
        conversationId: record.conversationId,
        model:          record.model,
        promptHash:     record.promptHash,
        responseHash:   record.responseHash,
        plaintextHash:  record.plaintextHash,
        ciphertextHash: record.ciphertextHash,
        arweaveCid:     record.arweaveCid,
      });
      const recovered = window.ethers.verifyMessage(window.ethers.getBytes(digest), record.attesterSig);
      const match = recovered.toLowerCase() === record.attester.toLowerCase();
      setVerified(match);
      setVerifyMsg(match
        ? `Signed by ${record.attester}`
        : `Signature recovers to ${recovered}, expected ${record.attester}`);
      toast(match ? 'Signature valid' : 'Signature mismatch', match ? 'success' : 'error');
    } catch (err) {
      setVerified(false);
      setVerifyMsg(err?.message || 'Verification failed');
      toast('Verification failed', 'error');
    }
  };

  // Verify the stored ciphertext bytes hash to record.ciphertextHash.
  // Requires being able to fetch the bytes — for inline records, only the
  // sealing device can do this.
  const verifyIntegrity = async () => {
    try {
      const bytes = await window.NousPipeline.fetchCiphertext(record.arweaveCid);
      const got = window.NousPipeline.bytesHash(bytes);
      const match = got.toLowerCase() === record.ciphertextHash.toLowerCase();
      setIntegrity(match);
      setIntegrityMsg(match
        ? 'Ciphertext bytes match the on-chain hash'
        : `Hash mismatch: stored=${got.slice(0,18)}… expected=${record.ciphertextHash.slice(0,18)}…`);
      toast(match ? 'Integrity confirmed' : 'Integrity FAILED', match ? 'success' : 'error');
    } catch (err) {
      setIntegrity(false);
      setIntegrityMsg(err?.message || 'Could not fetch ciphertext');
      toast('Integrity check failed', 'error');
    }
  };

  const decrypt = async () => {
    setDecrypting(true);
    setDecryptErr(null);
    try {
      if (!window.ethereum) throw new Error('No wallet provider');
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const env = await window.NousPipeline.decryptByCid({
        signer,
        cid: record.arweaveCid,
        expectedCiphertextHash: record.ciphertextHash,
      });
      setEnvelope(env);
      toast('Decrypted', 'success');
    } catch (err) {
      console.error(err);
      const msg = err?.message || 'Decryption failed';
      setDecryptErr(msg);
      toast(msg, 'error');
    } finally {
      setDecrypting(false);
    }
  };

  const ProofRow = ({ label, value, mono = true }) => (
    <Hash label={label} value={value} />
  );

  return <div style={{ position: 'relative', zIndex: 1, maxWidth: 980, margin: '0 auto', padding: '32px 32px 96px' }}>
    <button onClick={() => go(isOwner ? 'my-records' : 'landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--sky-600)', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, padding: 0 }}>
      <I name="arrow-left" size={14} /> {isOwner ? 'Back to My records' : 'Back to Explore'}
    </button>

    <div style={{ marginBottom: 20 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 48, margin: 0, letterSpacing: '-0.02em' }}>Record #{record.id}</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' }}>
        {envelope ? <Badge variant="verified"><I name="unlock" size={10} /> Open</Badge>
                  : <Badge variant="encrypted"><I name="lock" size={10} /> Encrypted</Badge>}
        {verified === true && <Badge variant="verified"><I name="check" size={10} /> Sig verified</Badge>}
        <Badge variant="model">{record.model}</Badge>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }} title={sealedDate}>
          {sealedDate.slice(0, 19).replace('T', ' ')} UTC
        </span>
        <button onClick={() => { navigator.clipboard?.writeText(window.location.href); toast('Link copied', 'info'); }} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: 10, padding: '6px 14px', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--sky-600)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <I name="share-2" size={13} /> Share
        </button>
      </div>
    </div>

    {/* Author */}
    <Card style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 20, marginBottom: 20 }}>
      <Avatar address={record.author} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>{record.author}</span>
          <I name="copy" size={13} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => { navigator.clipboard?.writeText(record.author); toast('Address copied', 'info'); }} />
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>
          {isOwner ? 'You sealed this record.' : 'Sealed by this address.'}
        </div>
      </div>
    </Card>

    {/* Proof panel */}
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
          <I name="shield" size={18} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, margin: 0 }}>Cryptographic proof</h3>
      </div>
      <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <ProofRow label="Storage CID"     value={record.arweaveCid} />
        <ProofRow label="Conversation ID" value={record.conversationId} />
        <ProofRow label="Prompt hash"     value={record.promptHash} />
        <ProofRow label="Response hash"   value={record.responseHash} />
        <ProofRow label="Plaintext hash"  value={record.plaintextHash} />
        <ProofRow label="Ciphertext hash" value={record.ciphertextHash} />
        <ProofRow label="Attester"        value={record.attester} />
        <ProofRow label="Attester sig"    value={record.attesterSig} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <Button variant="primary" size="md" onClick={verifySignature}>
          <I name="shield" size={14} /> Verify signature
        </Button>
        <Button variant="secondary" size="md" onClick={verifyIntegrity}>
          <I name="check-circle-2" size={14} /> Verify integrity
        </Button>
        <Button variant="ghost" size="md" onClick={() => go('replay', { recordId: record.id })} title="Re-run this conversation through the same model">
          <I name="play" size={14} /> Replay
        </Button>
      </div>
      {(verifyMsg || integrityMsg) && <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {verifyMsg && <div style={{
          background: verified
            ? 'linear-gradient(180deg, rgba(174,213,129,0.4), rgba(139,195,74,0.2))'
            : 'rgba(255,138,128,0.18)',
          border: '1px solid ' + (verified ? 'rgba(139,195,74,0.5)' : 'rgba(229,57,53,0.4)'),
          borderRadius: 10, padding: '10px 14px',
          fontFamily: 'var(--font-body)', fontSize: 14,
          color: verified ? '#1B3F08' : 'var(--text-primary)',
          display: 'flex', alignItems: 'center', gap: 8, wordBreak: 'break-word',
        }}>
          <I name={verified ? 'check-circle-2' : 'x-circle'} size={16} /> {verifyMsg}
        </div>}
        {integrityMsg && <div style={{
          background: integrity
            ? 'linear-gradient(180deg, rgba(174,213,129,0.4), rgba(139,195,74,0.2))'
            : 'rgba(255,138,128,0.18)',
          border: '1px solid ' + (integrity ? 'rgba(139,195,74,0.5)' : 'rgba(229,57,53,0.4)'),
          borderRadius: 10, padding: '10px 14px',
          fontFamily: 'var(--font-body)', fontSize: 14,
          color: integrity ? '#1B3F08' : 'var(--text-primary)',
          display: 'flex', alignItems: 'center', gap: 8, wordBreak: 'break-word',
        }}>
          <I name={integrity ? 'check-circle-2' : 'x-circle'} size={16} /> {integrityMsg}
        </div>}
      </div>}
    </Card>

    {/* Content */}
    {envelope ? (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, margin: 0 }}>
            Content {envelope.v === 2 && Array.isArray(envelope.messages) ? `(${envelope.messages.length} messages)` : ''}
          </h3>
          <span style={{ flex: 1 }} />
          {isOwner && (
            <Button variant="ghost" size="sm" onClick={() => go('chat', { envelope, sourceId: record.id })} title="Continue this conversation in a fresh chat">
              <I name="message-square" size={13} /> Continue
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => go('replay', { recordId: record.id })} title="Replay this record through the same model">
            <I name="play" size={13} /> Replay
          </Button>
        </div>
        {envelope.v === 2 && Array.isArray(envelope.messages) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {envelope.messages.map((m, i) => (
              <div key={i} style={{
                background: m.role === 'user'
                  ? 'linear-gradient(180deg, rgba(234,247,255,0.7), rgba(201,234,251,0.5))'
                  : m.role === 'system'
                    ? 'rgba(255,243,224,0.55)'
                    : 'rgba(255,255,255,0.6)',
                border: '1px solid ' + (m.role === 'user' ? 'rgba(126,200,227,0.5)' : m.role === 'system' ? 'rgba(255,167,38,0.35)' : 'rgba(255,255,255,0.8)'),
                borderRadius: 12, padding: 14,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: m.role === 'user' ? 'var(--sky-700)' : m.role === 'system' ? '#E65100' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  {m.role === 'user' ? 'You' : m.role === 'system' ? 'Persona' : (envelope.model || 'Assistant')}
                </div>
                {m.role === 'assistant'
                  ? <MarkdownContent text={m.content} />
                  : <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</div>}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div style={{ background: 'linear-gradient(180deg, rgba(234,247,255,0.7), rgba(201,234,251,0.5))', border: '1px solid rgba(126,200,227,0.5)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sky-700)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Prompt</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, whiteSpace: 'pre-wrap' }}>{envelope.prompt}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Response</div>
              <MarkdownContent text={envelope.response} />
            </div>
          </>
        )}
      </Card>
    ) : isOwner ? (
      <Card style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 6px 18px rgba(2,136,209,0.3)', margin: '0 auto 20px' }}>
          <I name="lock" size={36} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: 0 }}>This conversation is encrypted.</h3>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 15, color: 'var(--text-secondary)', margin: '8px 0 18px' }}>
          You hold the key. Sign once to derive it and unlock.
        </p>
        {decryptErr && (
          <div style={{ background: 'rgba(255,138,128,0.18)', border: '1px solid rgba(229,57,53,0.4)', borderRadius: 10, padding: '8px 14px', fontSize: 13, marginBottom: 14, maxWidth: 540, margin: '0 auto 14px', wordBreak: 'break-word' }}>
            <I name="x-circle" size={14} style={{ color: '#E53935', marginRight: 6, verticalAlign: 'middle' }} />
            {decryptErr}
          </div>
        )}
        <Button variant="primary" size="md" onClick={decrypt} disabled={decrypting}>
          {decrypting
            ? <><div className="spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%' }} /> Decrypting…</>
            : <><I name="unlock" size={14} /> Sign to decrypt</>}
        </Button>
      </Card>
    ) : (
      <Card style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 6px 18px rgba(2,136,209,0.3)', margin: '0 auto 20px' }}>
          <I name="lock" size={36} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: 0 }}>Encrypted by the author.</h3>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 15, color: 'var(--text-secondary)', margin: '8px 0 14px' }}>
          Only {record.author.slice(0,6)}…{record.author.slice(-4)} can decrypt it. The proof above shows it was attested and sealed; the contents stay private.
        </p>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'rgba(255,255,255,0.45)', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.7)', maxWidth: 540, margin: '0 auto', wordBreak: 'break-all' }}>
          {record.arweaveCid}
        </div>
      </Card>
    )}
  </div>;
};

Object.assign(window, { RecordDetail });
