export function computeStatistics(data) {
  const savedWords = data.vocabulary.length;
  const learnedWords = data.vocabulary.filter((item) => item.learned).length;
  const booksRead = data.books.filter((book) => (book.progress?.percent || 0) >= 95).length;
  const pagesRead = data.books.reduce((sum, book) => {
    const pages = Math.ceil((book.wordCount || 0) / 250);
    return sum + Math.round(pages * ((book.progress?.percent || 0) / 100));
  }, 0);
  const readingMinutes = data.books.reduce((sum, book) => {
    const minutes = Math.ceil((book.wordCount || 0) / 220);
    return sum + Math.round(minutes * ((book.progress?.percent || 0) / 100));
  }, 0);

  return {
    totalBooks: data.books.length,
    booksRead,
    pagesRead,
    readingMinutes,
    savedWords,
    learnedWords,
  };
}
