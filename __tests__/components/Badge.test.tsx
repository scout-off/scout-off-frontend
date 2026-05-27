import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import Badge from '../../components/ui/Badge'

describe('Badge', () => {
  test('renders the label and uses a span', () => {
    render(<Badge variant="level1" label="Hello" />)
    const el = screen.getByText('Hello')
    expect(el).toBeInTheDocument()
    expect(el.tagName).toBe('SPAN')
  })

  test('applies correct variant colour classes', () => {
    render(<Badge variant="level2" label="Lvl2" />)
    const el = screen.getByText('Lvl2')
    expect(el).toHaveClass('bg-yellow-100')
    expect(el).toHaveClass('text-yellow-800')
  })

  test('sm and md sizes are visually distinct via classes', () => {
    const { rerender } = render(<Badge variant="level0" label="Small" size="sm" />)
    const small = screen.getByText('Small')
    expect(small).toHaveClass('text-xs')

    rerender(<Badge variant="level0" label="Medium" size="md" />)
    const medium = screen.getByText('Medium')
    expect(medium).toHaveClass('text-sm')
  })

  test('has accessible attributes and no undefined classes', () => {
    render(<Badge variant="region" label="Region" />)
    const el = screen.getByText('Region')
    expect(el).toHaveAttribute('aria-label', 'Region')
    expect(el).toHaveAttribute('role', 'status')
    expect(el.className).not.toMatch(/undefined|\[|\]/)
  })
})
