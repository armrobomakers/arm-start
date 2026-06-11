export function CardList({ items }) {
  return (
    <ul className="card-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
