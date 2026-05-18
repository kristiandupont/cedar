import type { ComponentProps, ComponentType, FC, ReactNode } from "react";

export interface WrapperItem {
  Wrapper: ComponentType<any>;
  props: any;
}

export const wrp = <T extends ComponentType<any>>(
  Wrapper: T,
  props: Omit<ComponentProps<T>, "children"> | undefined = undefined,
): WrapperItem => ({ Wrapper, props });

const combineWrappers = (
  displayName: string,
  wrappers: WrapperItem[],
): FC<{ children: ReactNode | null }> => {
  const result: FC<{ children: ReactNode | null }> = (({ children }) =>
    wrappers.reduceRight(
      (acc, { Wrapper, props }) => <Wrapper {...props}>{acc}</Wrapper>,
      children,
    )) as FC<{ children: ReactNode | null }>;
  result.displayName = displayName;
  return result;
};

export default combineWrappers;
