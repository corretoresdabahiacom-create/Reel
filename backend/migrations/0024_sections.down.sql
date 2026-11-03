-- Reverte 0024: só remove a flag (as cenas criadas pelas seções são cenas comuns e continuam válidas).
DELETE FROM feature_flags WHERE key = 'ff_sections';
