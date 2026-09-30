export default function LoginSessionsLoading() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-8 w-36 rounded" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="skeleton h-24 rounded-md border" />
      ))}
    </div>
  );
}
