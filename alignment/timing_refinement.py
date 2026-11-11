"""Refine word boundaries without inventing timings for unmatched words."""
import math


def word_reliable(word):
    duration = word.end - word.start
    if duration <= 0:
        return False
    probability = getattr(word, 'probability', None)
    letters = sum(c.isalnum() for c in word.word)
    # Whisper can stretch a low-confidence short word across an instrumental intro.
    return not (probability is not None and probability < .25
                and duration > max(1.0, letters * .3))


def valid_refinement(original, candidate, duration):
    before = [w for s in original.segments for w in (s.words or [])]
    after = [w for s in candidate.segments for w in (s.words or [])]
    if not before or len(before) != len(after):
        return False
    previous_start = -1
    for old, new in zip(before, after):
        if old.word != new.word or not all(math.isfinite(v) for v in (new.start, new.end)):
            return False
        if not 0 <= new.start <= new.end <= duration + .02:
            return False
        if new.start < previous_start:
            return False
        if old.end > old.start and new.end - new.start < .02:
            return False
        if old.end <= old.start and new.end > new.start:
            return False
        previous_start = new.start
    return True


def refine_boundaries(model, audio, result, language, stable_whisper):
    # Anchored alignment returns plain objects; convert them for the library API.
    payload = dict(language=language, segments=[dict(
        start=s.start, end=s.end, text=s.text,
        words=[dict(start=w.start, end=w.end, word=w.word,
                    probability=getattr(w, 'probability', None)) for w in (s.words or [])]
    ) for s in result.segments])
    original = stable_whisper.WhisperResult(payload)
    candidate = stable_whisper.WhisperResult(original.to_dict())
    # Energy-based suppression only detects actual quiet gaps; no downloaded VAD.
    candidate.adjust_by_silence(audio, vad=False, verbose=None, k_size=3,
                                min_word_dur=.04, word_level=True)
    # Token-probability refinement distinguishes word boundaries within music.
    candidate = model.refine(audio, candidate, steps='se', precision=.04,
                             abs_dur_change=.35, rel_dur_change=.5,
                             word_level=True, inplace=True, verbose=None)
    if not valid_refinement(original, candidate, len(audio) / 16000):
        raise ValueError('Уточнение изменило текст или вернуло ненадёжные границы слов')
    return candidate
