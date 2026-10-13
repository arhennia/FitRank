# Validation summary

The test split was not scored. The selection rule is `ml/config/tuning.v1.json`.

Chosen arm `hybrid__inverted__literal-product__zscore__a0.5__l0.9`. Macro NDCG@10 0.798. Lambda decision: largest lambda with a diversity gain and NDCG@10 loss at or below the budget.

Config hash `5d3d774895e1a329336d6250ed4e7ad6b7f8fc806ab09c832f65547d2ceedda0`.

| Arm | Task | Macro NDCG@10 | 95% interval | Precision@10 | Diversity@10 |
| --- | --- | ---: | --- | ---: | ---: |
| hybrid__inverted__literal-product__zscore__a0.5 | hybrid | 0.798 | 0.786 to 0.809 | 0.794 | 0.058 |
| hybrid__inverted__literal-product__zscore__a0.5__l0.9 | hybrid | 0.798 | 0.786 to 0.809 | 0.794 | 0.058 |
| hybrid__inverted__literal-product__zscore__a0.5__l0.7 | hybrid | 0.798 | 0.785 to 0.809 | 0.794 | 0.058 |
| hybrid__inverted__literal-product__zscore__a0.5__l0.5 | hybrid | 0.796 | 0.784 to 0.808 | 0.792 | 0.058 |
| hybrid__as-is__literal-photo__zscore__a0.5 | hybrid | 0.792 | 0.779 to 0.804 | 0.781 | 0.062 |
| hybrid__as-is__literal-product__zscore__a0.5 | hybrid | 0.791 | 0.779 to 0.802 | 0.780 | 0.060 |
| hybrid__inverted__literal-photo__zscore__a0.5 | hybrid | 0.790 | 0.777 to 0.803 | 0.789 | 0.059 |
| hybrid__inverted__literal-grayscale__zscore__a0.5 | hybrid | 0.785 | 0.773 to 0.798 | 0.777 | 0.060 |
| hybrid__as-is__literal-photo__zscore__a0.75 | hybrid | 0.785 | 0.771 to 0.798 | 0.772 | 0.058 |
| hybrid__inverted__literal-product__zscore__a0.75 | hybrid | 0.785 | 0.770 to 0.798 | 0.774 | 0.056 |
| hybrid__inverted__literal-photo__zscore__a0.75 | hybrid | 0.785 | 0.770 to 0.799 | 0.775 | 0.056 |
| hybrid__as-is__literal-product__zscore__a0.75 | hybrid | 0.783 | 0.769 to 0.795 | 0.769 | 0.058 |
| hybrid__inverted__literal-grayscale__zscore__a0.75 | hybrid | 0.778 | 0.764 to 0.793 | 0.769 | 0.057 |
| hybrid__inverted__literal-photo__zscore__a0.25 | hybrid | 0.777 | 0.764 to 0.789 | 0.772 | 0.065 |
| hybrid__as-is__literal-grayscale__zscore__a0.75 | hybrid | 0.776 | 0.761 to 0.789 | 0.765 | 0.058 |
| hybrid__as-is__literal-photo__rrf__a0.5 | hybrid | 0.775 | 0.762 to 0.787 | 0.766 | 0.070 |
| hybrid__inverted__literal-grayscale__zscore__a0.25 | hybrid | 0.775 | 0.762 to 0.787 | 0.764 | 0.069 |
| hybrid__as-is__literal-grayscale__zscore__a0.5 | hybrid | 0.774 | 0.762 to 0.788 | 0.765 | 0.063 |
| hybrid__inverted__literal-product__rrf__a0.5 | hybrid | 0.774 | 0.761 to 0.786 | 0.766 | 0.066 |
| hybrid__as-is__literal-photo__rrf__a0.75 | hybrid | 0.774 | 0.760 to 0.787 | 0.758 | 0.058 |
| hybrid__inverted__literal-grayscale__rrf__a0.5 | hybrid | 0.773 | 0.760 to 0.785 | 0.766 | 0.067 |
| hybrid__inverted__literal-photo__rrf__a0.5 | hybrid | 0.772 | 0.758 to 0.784 | 0.770 | 0.066 |
| hybrid__as-is__literal-grayscale__rrf__a0.75 | hybrid | 0.772 | 0.757 to 0.785 | 0.759 | 0.059 |
| hybrid__as-is__literal-product__rrf__a0.75 | hybrid | 0.769 | 0.755 to 0.782 | 0.754 | 0.058 |
| hybrid__inverted__literal-product__zscore__a0.25 | hybrid | 0.769 | 0.757 to 0.779 | 0.763 | 0.063 |
| hybrid__as-is__literal-product__rrf__a0.5 | hybrid | 0.768 | 0.755 to 0.779 | 0.759 | 0.069 |
| hybrid__inverted__literal-photo__rrf__a0.75 | hybrid | 0.768 | 0.751 to 0.783 | 0.759 | 0.057 |
| hybrid__as-is__literal-product__zscore__a0.25 | hybrid | 0.766 | 0.753 to 0.778 | 0.761 | 0.067 |
| hybrid__inverted__literal-grayscale__rrf__a0.75 | hybrid | 0.766 | 0.749 to 0.781 | 0.757 | 0.057 |
| hybrid__inverted__literal-product__rrf__a0.75 | hybrid | 0.765 | 0.749 to 0.780 | 0.755 | 0.057 |
| hybrid__as-is__literal-photo__zscore__a0.25 | hybrid | 0.762 | 0.749 to 0.776 | 0.753 | 0.071 |
| hybrid__as-is__literal-grayscale__rrf__a0.5 | hybrid | 0.761 | 0.748 to 0.774 | 0.751 | 0.069 |
| image__as-is | image | 0.758 | 0.734 to 0.781 | 0.744 | 0.059 |
| image__inverted | image | 0.758 | 0.729 to 0.783 | 0.746 | 0.057 |
| hybrid__inverted__literal-photo__rrf__a0.25 | hybrid | 0.755 | 0.741 to 0.769 | 0.745 | 0.071 |
| hybrid__inverted__literal-grayscale__rrf__a0.25 | hybrid | 0.755 | 0.741 to 0.769 | 0.742 | 0.074 |
| hybrid__padded__literal-photo__zscore__a0.5 | hybrid | 0.749 | 0.736 to 0.760 | 0.736 | 0.060 |
| hybrid__padded__literal-photo__zscore__a0.75 | hybrid | 0.747 | 0.733 to 0.760 | 0.735 | 0.058 |
| hybrid__as-is__literal-grayscale__zscore__a0.25 | hybrid | 0.747 | 0.734 to 0.759 | 0.738 | 0.074 |
| hybrid__padded__literal-product__zscore__a0.75 | hybrid | 0.743 | 0.730 to 0.757 | 0.731 | 0.057 |
| hybrid__padded__literal-grayscale__zscore__a0.75 | hybrid | 0.742 | 0.728 to 0.756 | 0.730 | 0.058 |
| hybrid__padded__literal-photo__rrf__a0.75 | hybrid | 0.739 | 0.724 to 0.753 | 0.725 | 0.058 |
| hybrid__padded__literal-grayscale__zscore__a0.5 | hybrid | 0.738 | 0.725 to 0.749 | 0.724 | 0.062 |
| hybrid__padded__literal-photo__rrf__a0.5 | hybrid | 0.738 | 0.726 to 0.749 | 0.726 | 0.067 |
| hybrid__padded__literal-grayscale__rrf__a0.75 | hybrid | 0.736 | 0.721 to 0.750 | 0.724 | 0.058 |
| hybrid__padded__literal-product__rrf__a0.75 | hybrid | 0.734 | 0.720 to 0.747 | 0.721 | 0.058 |
| hybrid__padded__literal-product__zscore__a0.5 | hybrid | 0.732 | 0.720 to 0.743 | 0.723 | 0.058 |
| hybrid__padded__literal-grayscale__rrf__a0.5 | hybrid | 0.731 | 0.718 to 0.743 | 0.718 | 0.069 |
| image__padded | image | 0.729 | 0.704 to 0.756 | 0.717 | 0.058 |
| text__inverted__literal-photo | text | 0.724 | 0.631 to 0.809 | 0.713 | 0.074 |
| hybrid__padded__literal-photo__zscore__a0.25 | hybrid | 0.721 | 0.709 to 0.733 | 0.710 | 0.065 |
| hybrid__inverted__literal-product__rrf__a0.25 | hybrid | 0.718 | 0.704 to 0.732 | 0.705 | 0.067 |
| hybrid__as-is__literal-photo__rrf__a0.25 | hybrid | 0.718 | 0.703 to 0.732 | 0.702 | 0.078 |
| hybrid__padded__literal-product__rrf__a0.5 | hybrid | 0.716 | 0.704 to 0.727 | 0.707 | 0.065 |
| text__inverted__literal-grayscale | text | 0.716 | 0.615 to 0.807 | 0.703 | 0.078 |
| pixel__mean-centered | pixel | 0.705 | 0.677 to 0.733 | 0.694 | 0.150 |
| hybrid__padded__literal-grayscale__zscore__a0.25 | hybrid | 0.705 | 0.694 to 0.717 | 0.689 | 0.070 |
| hybrid__as-is__literal-grayscale__rrf__a0.25 | hybrid | 0.704 | 0.689 to 0.717 | 0.682 | 0.081 |
| hybrid__padded__literal-photo__rrf__a0.25 | hybrid | 0.701 | 0.688 to 0.713 | 0.691 | 0.072 |
| hybrid__as-is__literal-product__rrf__a0.25 | hybrid | 0.699 | 0.683 to 0.713 | 0.679 | 0.072 |
| pixel__raw | pixel | 0.698 | 0.670 to 0.725 | 0.687 | 0.082 |
| text__as-is__literal-photo | text | 0.690 | 0.588 to 0.781 | 0.677 | 0.082 |
| hybrid__padded__literal-grayscale__rrf__a0.25 | hybrid | 0.688 | 0.673 to 0.703 | 0.667 | 0.077 |
| text__inverted__literal-product | text | 0.681 | 0.575 to 0.774 | 0.677 | 0.068 |
| hybrid__padded__literal-product__zscore__a0.25 | hybrid | 0.678 | 0.666 to 0.688 | 0.670 | 0.062 |
| lexical__literal-photo | lexical | 0.667 | 0.475 to 0.850 | 0.667 | 0.112 |
| lexical__literal-grayscale | lexical | 0.667 | 0.475 to 0.850 | 0.667 | 0.112 |
| lexical__literal-product | lexical | 0.667 | 0.475 to 0.850 | 0.667 | 0.112 |
| text__as-is__literal-product | text | 0.662 | 0.555 to 0.761 | 0.647 | 0.075 |
| text__padded__literal-grayscale | text | 0.661 | 0.557 to 0.756 | 0.637 | 0.079 |
| text__padded__literal-photo | text | 0.656 | 0.569 to 0.743 | 0.650 | 0.076 |
| text__as-is__literal-grayscale | text | 0.654 | 0.567 to 0.741 | 0.633 | 0.086 |
| hybrid__padded__literal-product__rrf__a0.25 | hybrid | 0.640 | 0.627 to 0.651 | 0.624 | 0.067 |
| text__padded__literal-product | text | 0.608 | 0.515 to 0.694 | 0.597 | 0.068 |

