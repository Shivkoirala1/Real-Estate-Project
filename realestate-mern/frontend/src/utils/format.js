export const formatPrice = (price, currency = 'NPR') => {
  if (price === undefined || price === null) return '—';
  return `${currency} ${Number(price).toLocaleString('en-IN')}`;
};

export const statusStyles = {
  available: { bg: '#3C6E52', label: 'Available' },
  reserved: { bg: '#B8863B', label: 'Reserved' },
  sold: { bg: '#A6472F', label: 'Sold' },
};

export const timeAgo = (date) => {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  const ranges = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [label, secondsInRange] of ranges) {
    const count = Math.floor(seconds / secondsInRange);
    if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`;
  }
  return `${seconds} second${seconds === 1 ? '' : 's'} ago`;
};

export const imageUrl = (path) => {
  if (!path) return 'https://placehold.co/800x600/10293B/F7F4EE?text=No+Image';
  if (path.startsWith('http')) return path;
  return path;
};
