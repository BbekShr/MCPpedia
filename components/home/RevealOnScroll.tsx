'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

/**
 * Wraps a homepage section and plays the same blur-up entrance the hero uses,
 * but triggered when the section scrolls into view (once). Keeps the page
 * cohesive without animating everything at once on load.
 */
export default function RevealOnScroll({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, filter: 'blur(12px)', y: 16 }}
      whileInView={{
        opacity: 1,
        filter: 'blur(0px)',
        y: 0,
        transition: { type: 'spring', bounce: 0.3, duration: 1.2, delay },
      }}
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.div>
  )
}
