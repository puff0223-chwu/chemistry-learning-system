-- 示範資料（可選）：若想用 SQL Editor 手動插入，執行以下內容即可。
-- 若已由 Claude Code 透過 REST API 自動寫入，這份檔案僅作為備份／參考用途。

insert into topics (name, description, story_context, character_intro)
values (
  '實驗室安全守則',
  '學習進入化學實驗室前必須知道的安全規則',
  '你是一位剛進入高中化學實驗室的新生，學長姊告訴你，在開始實驗之前，必須先通過實驗室安全守則的測驗，否則不能進入實驗室...',
  '角色：好奇的新生小明'
)
returning id;

-- 請將下方 :topic_id 換成上面 insert 回傳的 id 後再執行
insert into questions (topic_id, mode, type, content, answer, hint_1)
values (
  :topic_id,
  'task',
  'fill',
  '進入實驗室時，長髮同學應該如何處理頭髮？',
  '綁起來',
  '想想頭髮接觸到藥品或火焰時會怎樣？'
);

insert into questions (topic_id, mode, type, content, option_a, option_b, option_c, option_d, answer)
values (
  :topic_id,
  'both',
  'choice',
  '實驗室中發生小型火災，第一步應該怎麼做？',
  '用水澆熄',
  '立刻逃跑',
  '通報老師並使用滅火器',
  '繼續實驗',
  'C'
);

insert into questions (topic_id, mode, type, content, answer)
values (
  :topic_id,
  'task',
  'fill',
  '使用強酸或強鹼時，必須在臉部配戴什麼防護裝備？',
  '護目鏡'
);
