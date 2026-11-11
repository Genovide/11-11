"""Regression checks for unreliable intro words and safe boundary refinement."""
import pathlib
import sys
from types import SimpleNamespace as Obj

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / 'alignment'))
from timing_refinement import word_reliable, valid_refinement

def word(text, start, end, probability=None):
    return Obj(word=text, start=start, end=end, probability=probability)

def result(*words):
    return Obj(segments=[Obj(words=list(words))])

assert not word_reliable(word('И', .1, 3.5, .1))
assert word_reliable(word('И', 3.1, 3.25, .9))
assert not word_reliable(word('нет', 3, 3))
assert word_reliable(word('слово', 3, 3.5))
before = result(word('И', 3, 3.2), word('так', 3.2, 3.7), word('нет', 4, 4))
assert valid_refinement(before, result(word('И', 3.05, 3.25), word('так', 3.3, 3.8), word('нет', 4, 4)), 5)
assert not valid_refinement(before, result(word('И', 3, 3.2), word('так', 3.2, 3.7), word('нет', 4, 4.3)), 5)
assert not valid_refinement(before, result(word('И', 3, 3.2), word('иначе', 3.2, 3.7), word('нет', 4, 4)), 5)
assert not valid_refinement(before, result(word('И', 3, 3.2), word('так', 2, 2.5), word('нет', 4, 4)), 5)
assert not valid_refinement(before, result(word('И', float('nan'), 3.2), word('так', 3.2, 3.7), word('нет', 4, 4)), 5)
assert not valid_refinement(before, result(word('И', 3, 3.2)), 5)
assert not valid_refinement(before, result(word('И', 3, 3.001), word('так', 3.2, 3.7), word('нет', 4, 4)), 5)
print('Timing regression checks passed: intro confidence, unchanged words, order, bounds and unmatched-word protection')
