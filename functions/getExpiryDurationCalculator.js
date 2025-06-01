function calculateExpiry(duration) {
  if (!duration || duration === "permanent") {
    return null; // no expiry
  }

  const unit = duration.slice(-1); // last char: 'm' or 'h'
  const amount = parseInt(duration.slice(0, -1), 10); // number part

  if (isNaN(amount)) return null;

  if (unit === "m") {
    return amount * 60 * 1000; // minutes to milliseconds
  } else if (unit === "h") {
    return amount * 60 * 60 * 1000; // hours to milliseconds
  }

  return null;
}


export default calculateExpiry;