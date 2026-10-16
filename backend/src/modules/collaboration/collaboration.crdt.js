import * as Y from "yjs";

import { validateContentSnapshot } from "./collaboration.persistence.js";

const MAX_UPDATE_BYTES = 256 * 1024;

const createCrdtDocument = (snapshot) => {
  const check = validateContentSnapshot(snapshot);
  if (!check.valid) {
    return { ok: false, reason: check.reason, doc: null };
  }

  const doc = new Y.Doc();
  doc.transact(() => {
    const blocks = doc.getArray("blocks");
    for (const block of snapshot.blocks) {
      const entry = new Y.Map();
      entry.set("type", block.type);
      const text = new Y.Text();
      if (block.text.length > 0) {
        text.insert(0, block.text);
      }
      entry.set("text", text);
      blocks.push([entry]);
    }
  });

  return { ok: true, reason: null, doc };
};

const extractSnapshot = (doc) => {
  const blocks = doc.getArray("blocks").toArray().map((entry) => {
    const type = entry.get("type");
    const text = entry.get("text");

    return {
      type: typeof type === "string" ? type : String(type ?? ""),
      text: text instanceof Y.Text ? text.toString() : String(text ?? ""),
    };
  });

  return { version: 1, blocks };
};

const applyCrdtUpdate = (doc, updateBytes) => {
  if (!(updateBytes instanceof Uint8Array) || updateBytes.length === 0) {
    return { ok: false, reason: "invalid update payload" };
  }

  if (updateBytes.length > MAX_UPDATE_BYTES) {
    return { ok: false, reason: "oversized update" };
  }

  try {
    Y.applyUpdate(doc, updateBytes);
    return { ok: true, reason: null };
  } catch {
    return { ok: false, reason: "invalid crdt payload" };
  }
};

const encodeFullState = (doc) => Y.encodeStateAsUpdate(doc);

const reconcilePatchIntoLiveState = (doc, content) => {
  const check = validateContentSnapshot(content);
  if (!check.valid) {
    return { ok: false, reason: check.reason };
  }

  doc.transact(() => {
    const blocks = doc.getArray("blocks");
    const existing = blocks.toArray();

    content.blocks.forEach((block, index) => {
      if (index < existing.length) {
        const entry = existing[index];
        entry.set("type", block.type);
        const text = entry.get("text");
        if (text instanceof Y.Text) {
          const currentLength = text.toString().length;
          if (currentLength > 0) {
            text.delete(0, currentLength);
          }
          if (block.text.length > 0) {
            text.insert(0, block.text);
          }
        } else {
          const newText = new Y.Text();
          if (block.text.length > 0) {
            newText.insert(0, block.text);
          }
          entry.set("text", newText);
        }
      } else {
        const entry = new Y.Map();
        entry.set("type", block.type);
        const text = new Y.Text();
        if (block.text.length > 0) {
          text.insert(0, block.text);
        }
        entry.set("text", text);
        blocks.push([entry]);
      }
    });
  });

  return { ok: true, reason: null };
};

export {
  MAX_UPDATE_BYTES,
  createCrdtDocument,
  extractSnapshot,
  applyCrdtUpdate,
  encodeFullState,
  reconcilePatchIntoLiveState,
};
