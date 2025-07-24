function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getAdjacentBoxes(lineId, boxes) {
  const adjacent = [];
  const lineCoords = lineId.split('-').map(Number);
  const normalizedLine =
    lineCoords[0] > lineCoords[2] ||
    (lineCoords[0] === lineCoords[2] && lineCoords[1] > lineCoords[3])
      ? [lineCoords[2], lineCoords[3], lineCoords[0], lineCoords[1]]
      : lineCoords;

  for (let i = 0; i < boxes.length; i++) {
    for (const boxLine of boxes[i]) {
      const normalizedBoxLine =
        boxLine[0] > boxLine[2] ||
        (boxLine[0] === boxLine[2] && boxLine[1] > boxLine[3])
          ? [boxLine[2], boxLine[3], boxLine[0], boxLine[1]]
          : boxLine;
      if (arraysEqual(normalizedBoxLine, normalizedLine)) {
        adjacent.push(i);
        break; // A line can't be in the same box twice
      }
    }
  }
  return adjacent;
}

/**
 * Simulates the opponent's moves to calculate the length of a chain they could take.
 * @param {number} startBoxIndex - The index of the box that starts the chain.
 * @param {object} tempClickedLines - A temporary copy of the game's clicked lines.
 * @param {Array<number>} tempBoxScores - A temporary copy of the game's box scores.
 * @param {Array} boxes - The main boxes data structure.
 * @returns {number} The total number of boxes in the chain.
 */
function calculateChainLength(
  startBoxIndex,
  tempClickedLines,
  tempBoxScores,
  boxes
) {
  const queue = [startBoxIndex];
  const visited = new Set([startBoxIndex]);
  let chainLength = 0;

  while (queue.length > 0) {
    const currentBoxIndex = queue.shift();
    chainLength++;

    // Find the single line the opponent needs to click to complete this box
    const completingLine = boxes[currentBoxIndex].find((line) => {
      const lineId = line.join('-');
      return !tempClickedLines[lineId];
    });

    if (!completingLine) continue; // Should not happen in a valid chain

    // Simulate the opponent clicking this line
    const completingLineId = completingLine.join('-');
    tempClickedLines[completingLineId] = 'opponent'; // Mark as taken

    // Now, see if this move sets up another box (i.e., continues the chain)
    const adjacentBoxes = getAdjacentBoxes(completingLineId, boxes);
    for (const neighborBoxIndex of adjacentBoxes) {
      if (neighborBoxIndex === currentBoxIndex) continue;

      // Increment the score of the neighboring box
      tempBoxScores[neighborBoxIndex]++;

      // If the neighbor now has 3 sides and hasn't been visited, it's part of the chain
      if (
        tempBoxScores[neighborBoxIndex] === 3 &&
        !visited.has(neighborBoxIndex)
      ) {
        visited.add(neighborBoxIndex);
        queue.push(neighborBoxIndex);
      }
    }
  }

  return chainLength;
}

/**
 * @param {number} width - The width of the board.
 * @param {number} height - The height of the board.
 * @param {object} clickedLines - The state object of all clicked lines.
 * @param {Array<number>} boxScores - The current scores of all boxes.
 * @param {Array} boxes - The main boxes data structure.
 * @returns {string|null} The lineId of the chosen move.
 */
export default function botPlayer(
  width,
  height,
  clickedLines,
  boxScores,
  boxes
) {
  // Better way to get all lines
  const allLines = new Set();
  boxes.forEach((box) => box.forEach((line) => allLines.add(line.join('-'))));
  const availableMoves = [...allLines].filter(
    (lineId) => !clickedLines[lineId]
  );

  if (availableMoves.length === 0) {
    return null;
  }

  const winningMoves = [];
  const safeMoves = [];
  const unsafeMoves = [];

  for (const move of availableMoves) {
    const adjacentBoxes = getAdjacentBoxes(move, boxes);
    let isWinningMove = false;
    let isUnsafeMove = false;

    for (const boxIndex of adjacentBoxes) {
      if (boxScores[boxIndex] === 3) {
        isWinningMove = true;
        break;
      }
      if (boxScores[boxIndex] === 2) {
        isUnsafeMove = true;
      }
    }

    if (isWinningMove) {
      winningMoves.push(move);
    } else if (isUnsafeMove) {
      unsafeMoves.push(move);
    } else {
      safeMoves.push(move);
    }
  }

  // Priority 1: Take any winning move.
  if (winningMoves.length > 0) {
    return winningMoves[0];
  }

  // Priority 2: Make a safe move.
  if (safeMoves.length > 0) {
    const randomIndex = Math.floor(Math.random() * safeMoves.length);
    return safeMoves[randomIndex];
  }

  // Priority 3: Make the SMARTEST sacrificial (unsafe) move.
  if (unsafeMoves.length > 0) {
    let minChainLength = Infinity;
    let bestUnsafeMoves = [];

    for (const move of unsafeMoves) {
      // Find the box this move would set up for the opponent
      const adjacent = getAdjacentBoxes(move, boxes);
      const startOfChainBoxes = adjacent.filter(
        (boxIndex) => boxScores[boxIndex] === 2
      );

      if (startOfChainBoxes.length === 0) continue; // Should not happen for an unsafe move

      // *** SIMULATION STEP ***
      // Create temporary copies of the game state to simulate the outcome
      const tempClickedLines = { ...clickedLines };
      const tempBoxScores = [...boxScores];

      // 1. Simulate the bot making its unsafe move
      tempClickedLines[move] = 'bot';
      getAdjacentBoxes(move, boxes).forEach((idx) => tempBoxScores[idx]++);

      // 2. Calculate the total length of the chain(s) this move opens up
      let totalChainCost = 0;
      for (const startBoxIndex of startOfChainBoxes) {
        // Pass the temporary state to the simulation function
        totalChainCost += calculateChainLength(
          startBoxIndex,
          tempClickedLines,
          tempBoxScores,
          boxes
        );
      }

      // 3. Compare this move's cost to the best found so far
      if (totalChainCost < minChainLength) {
        minChainLength = totalChainCost;
        bestUnsafeMoves = [move]; // New best move found
      } else if (totalChainCost === minChainLength) {
        bestUnsafeMoves.push(move); // Equally good move
      }
    }

    // From the moves that give away the smallest chain, pick one randomly.
    if (bestUnsafeMoves.length > 0) {
      const randomIndex = Math.floor(Math.random() * bestUnsafeMoves.length);
      return bestUnsafeMoves[randomIndex];
    }
  }

  // Fallback, should not be reached if logic is sound
  return availableMoves.length > 0 ? availableMoves[0] : null;
}
