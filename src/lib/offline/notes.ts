"use client";

// Las acciones de notes-actions.ts envueltas para funcionar sin conexión (ver offline/queue.ts).
import {
  saveNote as _saveNote,
  deleteNote as _deleteNote,
  setNotePinned as _setNotePinned,
  setNoteDone as _setNoteDone,
  moveNoteSection as _moveNoteSection,
} from "../notes-actions";
import { queueable } from "./queue";
export type { NoteResult } from "../notes-actions";

// Crear no aguanta repetirse (una nota nueva cortada a la mitad no se duplica); editar una existente tampoco molesta.
export const saveNote = queueable("notes.saveNote", _saveNote, { once: true });
export const deleteNote = queueable("notes.deleteNote", _deleteNote);
// Tildes: lo último gana (fijar y desfijar sin señal deja solo el último).
export const setNotePinned = queueable("notes.setNotePinned", _setNotePinned, { key: (id) => `fijada-${id}` });
export const setNoteDone = queueable("notes.setNoteDone", _setNoteDone, { key: (id) => `vista-${id}` });
export const moveNoteSection = queueable("notes.moveNoteSection", _moveNoteSection, { key: (id) => `seccion-${id}` });
