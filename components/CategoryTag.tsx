import Link from 'next/link'
import { CATEGORY_LABELS, type Category } from '@/lib/constants'

export default function CategoryTag({ category, linked = true }: { category: string; linked?: boolean }) {
  const label = CATEGORY_LABELS[category as Category] || category

  const classes = "inline-block px-2 py-0.5 rounded text-xs bg-tag-bg text-tag-text transition-colors duration-150"

  if (linked) {
    return (
      <Link href={`/category/${category}`} className={`${classes} hover:opacity-80`}>
        {label}
      </Link>
    )
  }

  return <span className={classes}>{label}</span>
}
