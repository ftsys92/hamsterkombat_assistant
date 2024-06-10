export const formatNumberCompact = (number) => {
    return new Intl.NumberFormat('en-US',
        { notation: 'compact', maximumFractionDigits: 2 }).format(number)
}
